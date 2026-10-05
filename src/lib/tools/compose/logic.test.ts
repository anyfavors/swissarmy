import { describe, expect, it } from 'vitest';
import { yamlToJson } from '../yaml/logic';
import {
	composeToRun,
	looksLikeCompose,
	parseMountSpec,
	parseRun,
	runToCompose,
	shellQuote,
	shellSplit
} from './logic';

const asJson = (yaml: string) => JSON.parse(yamlToJson(yaml).json);

describe('shellSplit', () => {
	it('handles quotes, escapes and continuations', () => {
		expect(shellSplit(`a 'b c' "d \\"e\\" \\$X" f\\ g \\\n h`)).toEqual([
			'a',
			'b c',
			'd "e" $X',
			'f g',
			'h'
		]);
		expect(shellSplit(`x "" ''`)).toEqual(['x', '', '']);
		expect(shellSplit('"a\\nb"')).toEqual(['a\\nb']);
		expect(shellSplit('a # comment')).toEqual(['a']);
		expect(shellSplit('a#b')).toEqual(['a#b']);
	});

	it('reports unterminated quotes and command separators', () => {
		expect(() => shellSplit(`a 'b`)).toThrow(/Unterminated single quote/);
		expect(() => shellSplit(`a "b`)).toThrow(/Unterminated double quote/);
		expect(() => shellSplit('docker run x && echo')).toThrow(/single command/);
	});

	it('quotes only when needed', () => {
		expect(shellQuote('nginx:1.25')).toBe('nginx:1.25');
		expect(shellQuote('a b')).toBe("'a b'");
		expect(shellQuote("it's")).toBe(`'it'\\''s'`);
		expect(shellQuote('')).toBe("''");
		expect(shellQuote('$HOME')).toBe("'$HOME'");
	});
});

describe('parseRun', () => {
	it('splits options, image and command', () => {
		const r = parseRun(
			'sudo docker container run --rm -it -p8080:80 --name=web nginx:1.25 nginx -g "daemon off;"'
		);
		expect(r.image).toBe('nginx:1.25');
		expect(r.args).toEqual(['nginx', '-g', 'daemon off;']);
		expect(r.flags.map((f) => [f.name, f.value])).toEqual([
			['rm', undefined],
			['interactive', undefined],
			['tty', undefined],
			['publish', '8080:80'],
			['name', 'web']
		]);
	});

	it('rejects unknown options and other commands', () => {
		expect(() => parseRun('docker run --bogus x')).toThrow(/Unknown option --bogus/);
		expect(() => parseRun('docker ps')).toThrow(/Expected "docker run"/);
		expect(() => parseRun('kubectl run x')).toThrow(/docker run/);
		expect(() => parseRun('docker run -d')).toThrow(/No image/);
		expect(() => parseRun('docker run --name')).toThrow(/needs a value/);
	});
});

describe('runToCompose', () => {
	it('converts the common flags', () => {
		const r = runToCompose(`docker run -d --name web --restart unless-stopped \\
  -p 8080:80 -p 127.0.0.1:443:443/tcp \\
  -v /srv/www:/usr/share/nginx/html:ro -v data:/data \\
  -e TZ=Europe/Oslo -e DEBUG --env-file .env \\
  --network backend -w /app -u 1000:1000 \\
  --cap-add NET_ADMIN --cap-drop ALL --device /dev/fuse \\
  --health-cmd "curl -f http://localhost/ || exit 1" --health-interval 30s --health-retries 3 \\
  --label traefik.enable=true --entrypoint /docker-entrypoint.sh \\
  nginx:1.25 nginx -g 'daemon off;'`);
		expect(r.service).toBe('web');
		const j = asJson(r.yaml);
		const s = j.services.web;
		expect(s.image).toBe('nginx:1.25');
		expect(s.container_name).toBe('web');
		expect(s.restart).toBe('unless-stopped');
		expect(s.ports).toEqual(['8080:80', '127.0.0.1:443:443/tcp']);
		expect(s.volumes).toEqual(['/srv/www:/usr/share/nginx/html:ro', 'data:/data']);
		expect(s.environment).toEqual(['TZ=Europe/Oslo', 'DEBUG']);
		expect(s.env_file).toEqual(['.env']);
		expect(s.networks).toEqual(['backend']);
		expect(s.working_dir).toBe('/app');
		expect(s.user).toBe('1000:1000');
		expect(s.cap_add).toEqual(['NET_ADMIN']);
		expect(s.cap_drop).toEqual(['ALL']);
		expect(s.devices).toEqual(['/dev/fuse']);
		expect(s.healthcheck).toEqual({
			test: ['CMD-SHELL', 'curl -f http://localhost/ || exit 1'],
			interval: '30s',
			retries: 3
		});
		expect(s.labels).toEqual(['traefik.enable=true']);
		expect(s.entrypoint).toEqual(['/docker-entrypoint.sh']);
		expect(s.command).toEqual(['nginx', '-g', 'daemon off;']);
		expect(j.networks).toEqual({ backend: { external: true } });
		expect(j.volumes).toEqual({ data: { external: true } });
		expect(r.notes.some((n) => /-d has no service key/.test(n.text))).toBe(true);
	});

	it('quotes values YAML 1.1 would misread', () => {
		const r = runToCompose('docker run -p 22:22 --restart no alpine');
		expect(r.yaml).toMatch(/- '22:22'/);
		expect(r.yaml).toMatch(/restart: 'no'/);
		expect(r.service).toBe('alpine');
	});

	it('converts --mount to the long syntax', () => {
		const r = runToCompose(
			'docker run --mount type=bind,source=/etc/app,target=/config,readonly,bind-propagation=rshared --mount type=tmpfs,target=/tmp,tmpfs-size=1000000,tmpfs-mode=1770 --mount source=cache,target=/cache,volume-nocopy busybox'
		);
		const s = asJson(r.yaml).services.busybox;
		expect(s.volumes).toEqual([
			{
				type: 'bind',
				source: '/etc/app',
				target: '/config',
				read_only: true,
				bind: { propagation: 'rshared' }
			},
			{ type: 'tmpfs', target: '/tmp', tmpfs: { size: 1000000, mode: 1016 } },
			{ type: 'volume', source: 'cache', target: '/cache', volume: { nocopy: true } }
		]);
		expect(parseMountSpec('type=bind,"source=/a,b",target=/c')).toEqual({
			type: 'bind',
			source: '/a,b',
			target: '/c'
		});
	});

	it('uses network_mode for host and container networks', () => {
		expect(asJson(runToCompose('docker run --net=host x').yaml).services.x.network_mode).toBe(
			'host'
		);
		const r = runToCompose('docker run --network front --network-alias api --ip 172.20.0.5 x');
		expect(asJson(r.yaml).services.x.networks).toEqual({
			front: { aliases: ['api'], ipv4_address: '172.20.0.5' }
		});
	});

	it('flags unsupported options explicitly', () => {
		const r = runToCompose('docker run -P --gpus all --cidfile /tmp/id x');
		const u = r.notes.filter((n) => n.level === 'unsupported').map((n) => n.text);
		expect(u).toHaveLength(3);
		expect(u[0]).toMatch(/^-P is not converted: Compose has no publish-all/);
		expect(u[1]).toMatch(/--gpus all is not converted: .*deploy\.resources/);
	});

	it('maps more options', () => {
		const s = asJson(
			runToCompose(
				'docker run --privileged --init --read-only --add-host db:10.0.0.2 --ulimit nofile=1024:2048 --sysctl net.core.somaxconn=1024 --log-driver json-file --log-opt max-size=10m -m 512m --cpus 1.5 --stop-timeout 30 --no-healthcheck img'
			).yaml
		).services.img;
		expect(s.privileged).toBe(true);
		expect(s.init).toBe(true);
		expect(s.read_only).toBe(true);
		expect(s.extra_hosts).toEqual(['db:10.0.0.2']);
		expect(s.ulimits).toEqual({ nofile: { soft: 1024, hard: 2048 } });
		expect(s.sysctls).toEqual({ 'net.core.somaxconn': '1024' });
		expect(s.logging).toEqual({ driver: 'json-file', options: { 'max-size': '10m' } });
		expect(s.mem_limit).toBe('512m');
		expect(s.cpus).toBe(1.5);
		expect(s.stop_grace_period).toBe('30s');
		expect(s.healthcheck).toEqual({ disable: true });
	});

	it('names the service after the image', () => {
		expect(runToCompose('docker run ghcr.io/org/my-app:v1').service).toBe('my-app');
		expect(runToCompose('docker run localhost:5000/tool@sha256:abc').service).toBe('tool');
	});
});

describe('composeToRun', () => {
	it('converts a service back', () => {
		const r = composeToRun(`services:
  web:
    image: nginx:1.25
    container_name: web
    restart: unless-stopped
    ports:
      - "8080:80"
      - target: 443
        published: 8443
        host_ip: 127.0.0.1
        protocol: udp
    volumes:
      - ./html:/usr/share/nginx/html:ro
      - type: bind
        source: /etc/app
        target: /config
        read_only: true
    environment:
      TZ: Europe/Oslo
      DEBUG:
    networks: [backend]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/"]
      interval: 30s
    command: nginx -g 'daemon off;'
    depends_on: [db]
  db:
    image: postgres:16
`);
		expect(r.service).toBe('web');
		expect(r.services).toEqual(['web', 'db']);
		expect(r.command).toBe(
			[
				'docker run -d',
				'--name web',
				'--restart unless-stopped',
				'-p 8080:80',
				'-p 127.0.0.1:8443:443/udp',
				'-v ./html:/usr/share/nginx/html:ro',
				'--mount type=bind,source=/etc/app,target=/config,readonly',
				'-e TZ=Europe/Oslo',
				'-e DEBUG',
				'--network backend',
				"--health-cmd 'curl -f http://localhost/'",
				'--health-interval 30s',
				"nginx:1.25 nginx -g 'daemon off;'"
			].join(' \\\n  ')
		);
		expect(r.notes.map((n) => n.text).join('\n')).toMatch(/depends_on/);
	});

	it('picks a service and moves extra entrypoint words', () => {
		const r = composeToRun(
			'services:\n  a:\n    image: x\n  b:\n    image: busybox\n    entrypoint: ["sh", "-c"]\n    command: ["echo hi"]\n',
			'b'
		);
		expect(r.command).toBe("docker run -d \\\n  --entrypoint sh \\\n  busybox -c 'echo hi'");
	});

	it('accepts a bare service mapping', () => {
		expect(composeToRun('image: redis:7\nrestart: always\n').command).toBe(
			'docker run -d \\\n  --restart always \\\n  redis:7'
		);
	});

	it('round-trips a run command', () => {
		const cmd =
			"docker run -d --name api -p 3000:3000 -e 'A=b c' -v data:/data --cap-add SYS_PTRACE node:20 node server.js";
		const back = composeToRun(runToCompose(cmd).yaml).command.replace(/ \\\n {2}/g, ' ');
		expect(back).toBe(cmd);
	});

	it('reports problems', () => {
		expect(() => composeToRun('services:\n  x:\n    build: .\n')).toThrow(/no image/);
		expect(() => composeToRun('- a\n- b\n')).toThrow(/Expected a Compose file/);
	});
});

describe('detect', () => {
	it('recognises docker run and Compose files', () => {
		expect(looksLikeCompose('docker run -d nginx')).toBe(0.9);
		expect(looksLikeCompose('services:\n  web:\n    image: nginx\n')).toBe(0.75);
		expect(looksLikeCompose('name: x\nimage: y')).toBe(0);
	});
});
