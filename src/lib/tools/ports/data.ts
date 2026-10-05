/**
 * Port reference.
 *
 * `iana` is the service name from the IANA Service Name and Transport Protocol Port Number
 * Registry (https://www.iana.org/assignments/service-names-port-numbers), given only where it
 * matches the use described. Entries with `common: true` are widespread conventions that are not
 * (or not for this use) what IANA lists for the port. Port ranges per RFC 6335: 0-1023 system
 * ports, 1024-49151 user ports, 49152-65535 dynamic/private.
 *
 * Risk notes are short reminders for services that should not be exposed to the internet.
 */

export type Proto = 'tcp' | 'udp' | 'tcp/udp';

export interface Port {
	port: number;
	/** Last port of a range, when the entry covers several. */
	to?: number;
	proto: Proto;
	iana?: string;
	name: string;
	desc: string;
	common?: boolean;
	risk?: string;
}

export const ports: Port[] = [
	{
		port: 7,
		proto: 'tcp/udp',
		iana: 'echo',
		name: 'Echo',
		desc: 'Echo service (RFC 862)',
		risk: 'UDP echo can be abused for reflection loops. Disable.'
	},
	{
		port: 9,
		proto: 'tcp/udp',
		iana: 'discard',
		name: 'Discard',
		desc: 'Discard service (RFC 863); also used for Wake-on-LAN magic packets over UDP'
	},
	{
		port: 19,
		proto: 'tcp/udp',
		iana: 'chargen',
		name: 'Chargen',
		desc: 'Character generator (RFC 864)',
		risk: 'Classic UDP amplification source. Disable.'
	},
	{
		port: 20,
		proto: 'tcp',
		iana: 'ftp-data',
		name: 'FTP data',
		desc: 'FTP data channel, active mode'
	},
	{
		port: 21,
		proto: 'tcp',
		iana: 'ftp',
		name: 'FTP',
		desc: 'File Transfer Protocol control channel',
		risk: 'Credentials and data in cleartext. Use SFTP or FTPS.'
	},
	{
		port: 22,
		proto: 'tcp',
		iana: 'ssh',
		name: 'SSH',
		desc: 'Secure Shell, also SFTP and SCP',
		risk: 'Constant brute-force scanning. Keys only, no password login, consider a VPN or allowlist.'
	},
	{
		port: 23,
		proto: 'tcp',
		iana: 'telnet',
		name: 'Telnet',
		desc: 'Unencrypted remote terminal',
		risk: 'Everything including passwords in cleartext; prime botnet target (Mirai). Never expose.'
	},
	{
		port: 25,
		proto: 'tcp',
		iana: 'smtp',
		name: 'SMTP',
		desc: 'Mail transfer between servers',
		risk: 'Check it is not an open relay. Many ISPs block outbound 25.'
	},
	{ port: 43, proto: 'tcp', iana: 'nicname', name: 'WHOIS', desc: 'WHOIS lookups (RFC 3912)' },
	{
		port: 49,
		proto: 'tcp',
		iana: 'tacacs',
		name: 'TACACS+',
		desc: 'Network device AAA (RFC 8907)'
	},
	{
		port: 53,
		proto: 'tcp/udp',
		iana: 'domain',
		name: 'DNS',
		desc: 'Domain Name System',
		risk: 'An open recursive resolver is used for amplification. Answer recursion for your own clients only.'
	},
	{
		port: 67,
		proto: 'udp',
		iana: 'bootps',
		name: 'DHCP server',
		desc: 'DHCP and BOOTP, server side'
	},
	{
		port: 68,
		proto: 'udp',
		iana: 'bootpc',
		name: 'DHCP client',
		desc: 'DHCP and BOOTP, client side'
	},
	{
		port: 69,
		proto: 'udp',
		iana: 'tftp',
		name: 'TFTP',
		desc: 'Trivial File Transfer, PXE boot and device configs',
		risk: 'No authentication at all. Keep inside management networks.'
	},
	{
		port: 79,
		proto: 'tcp',
		iana: 'finger',
		name: 'Finger',
		desc: 'User information (RFC 1288)',
		risk: 'Leaks user names. Disable.'
	},
	{ port: 80, proto: 'tcp', iana: 'http', name: 'HTTP', desc: 'Web, unencrypted' },
	{
		port: 88,
		proto: 'tcp/udp',
		iana: 'kerberos',
		name: 'Kerberos',
		desc: 'Kerberos authentication, Active Directory KDC'
	},
	{
		port: 110,
		proto: 'tcp',
		iana: 'pop3',
		name: 'POP3',
		desc: 'Mail retrieval',
		risk: 'Cleartext unless STARTTLS is enforced. Prefer 995.'
	},
	{
		port: 111,
		proto: 'tcp/udp',
		iana: 'sunrpc',
		name: 'RPC portmapper',
		desc: 'ONC RPC port mapper (rpcbind), used by NFS v3',
		risk: 'Information leak and UDP amplification. Do not expose.'
	},
	{ port: 119, proto: 'tcp', iana: 'nntp', name: 'NNTP', desc: 'Usenet news' },
	{
		port: 123,
		proto: 'udp',
		iana: 'ntp',
		name: 'NTP',
		desc: 'Network Time Protocol',
		risk: 'Old servers answering monlist were a large amplification source. Keep NTP patched and restricted.'
	},
	{
		port: 135,
		proto: 'tcp/udp',
		iana: 'epmap',
		name: 'MS RPC',
		desc: 'Microsoft RPC endpoint mapper (DCE/RPC)',
		risk: 'Windows RPC attack surface. Never expose to the internet.'
	},
	{
		port: 137,
		proto: 'udp',
		iana: 'netbios-ns',
		name: 'NetBIOS name',
		desc: 'NetBIOS name service',
		risk: 'Leaks host and domain names. Block at the edge.'
	},
	{
		port: 138,
		proto: 'udp',
		iana: 'netbios-dgm',
		name: 'NetBIOS datagram',
		desc: 'NetBIOS datagram service',
		risk: 'Block at the edge.'
	},
	{
		port: 139,
		proto: 'tcp',
		iana: 'netbios-ssn',
		name: 'NetBIOS session',
		desc: 'SMB over NetBIOS (legacy)',
		risk: 'SMB exposure, see 445. Block at the edge.'
	},
	{
		port: 143,
		proto: 'tcp',
		iana: 'imap',
		name: 'IMAP',
		desc: 'Mail access',
		risk: 'Cleartext unless STARTTLS is enforced. Prefer 993.'
	},
	{
		port: 161,
		proto: 'udp',
		iana: 'snmp',
		name: 'SNMP',
		desc: 'Device monitoring and management',
		risk: 'v1/v2c send community strings in cleartext, defaults like "public" are common, and it amplifies. Use SNMPv3, never expose.'
	},
	{
		port: 162,
		proto: 'udp',
		iana: 'snmptrap',
		name: 'SNMP trap',
		desc: 'SNMP notifications to a manager'
	},
	{
		port: 177,
		proto: 'udp',
		iana: 'xdmcp',
		name: 'XDMCP',
		desc: 'X Display Manager Control Protocol',
		risk: 'Unencrypted remote X logins. Do not expose.'
	},
	{
		port: 179,
		proto: 'tcp',
		iana: 'bgp',
		name: 'BGP',
		desc: 'Border Gateway Protocol',
		risk: 'Only to configured peers, with TCP-AO or MD5 and filtering.'
	},
	{
		port: 389,
		proto: 'tcp/udp',
		iana: 'ldap',
		name: 'LDAP',
		desc: 'Directory access, Active Directory',
		risk: 'Simple binds are cleartext; UDP (CLDAP) is used for amplification. Use LDAPS or signing, never expose.'
	},
	{
		port: 427,
		proto: 'tcp/udp',
		iana: 'svrloc',
		name: 'SLP',
		desc: 'Service Location Protocol, e.g. VMware ESXi',
		risk: 'Exploited in ESXi ransomware campaigns and used for amplification. Disable if unused.'
	},
	{
		port: 443,
		proto: 'tcp/udp',
		iana: 'https',
		name: 'HTTPS',
		desc: 'Web over TLS; UDP for HTTP/3 (QUIC)'
	},
	{
		port: 445,
		proto: 'tcp',
		iana: 'microsoft-ds',
		name: 'SMB',
		desc: 'Windows file sharing (SMB over TCP)',
		risk: 'WannaCry, NotPetya, EternalBlue. Never expose to the internet; block outbound at the edge too.'
	},
	{
		port: 464,
		proto: 'tcp/udp',
		iana: 'kpasswd',
		name: 'Kerberos password',
		desc: 'Kerberos password change'
	},
	{
		port: 465,
		proto: 'tcp',
		iana: 'submissions',
		name: 'SMTP submission, TLS',
		desc: 'Mail submission over implicit TLS (RFC 8314)'
	},
	{ port: 500, proto: 'udp', iana: 'isakmp', name: 'IKE', desc: 'IPsec key exchange (ISAKMP/IKE)' },
	{
		port: 502,
		proto: 'tcp',
		iana: 'mbap',
		name: 'Modbus',
		desc: 'Modbus TCP, industrial control',
		risk: 'No authentication. Industrial control systems must never be reachable from the internet.'
	},
	{
		port: 512,
		proto: 'tcp',
		iana: 'exec',
		name: 'rexec',
		desc: 'BSD remote execution',
		risk: 'Cleartext legacy r-service. Disable.'
	},
	{
		port: 513,
		proto: 'tcp',
		iana: 'login',
		name: 'rlogin',
		desc: 'BSD remote login',
		risk: 'Cleartext, host-based trust. Disable.'
	},
	{
		port: 514,
		proto: 'tcp',
		iana: 'shell',
		name: 'rsh',
		desc: 'BSD remote shell',
		risk: 'Cleartext, host-based trust. Disable.'
	},
	{
		port: 514,
		proto: 'udp',
		iana: 'syslog',
		name: 'Syslog',
		desc: 'Syslog over UDP (RFC 5426)',
		risk: 'Unauthenticated, spoofable. Prefer 6514 (TLS) across untrusted links.'
	},
	{ port: 515, proto: 'tcp', iana: 'printer', name: 'LPD', desc: 'Line Printer Daemon printing' },
	{ port: 520, proto: 'udp', iana: 'router', name: 'RIP', desc: 'Routing Information Protocol' },
	{
		port: 546,
		proto: 'udp',
		iana: 'dhcpv6-client',
		name: 'DHCPv6 client',
		desc: 'DHCPv6, client side'
	},
	{
		port: 547,
		proto: 'udp',
		iana: 'dhcpv6-server',
		name: 'DHCPv6 server',
		desc: 'DHCPv6, server and relay side'
	},
	{ port: 548, proto: 'tcp', iana: 'afpovertcp', name: 'AFP', desc: 'Apple Filing Protocol' },
	{
		port: 554,
		proto: 'tcp/udp',
		iana: 'rtsp',
		name: 'RTSP',
		desc: 'Real Time Streaming Protocol, IP cameras',
		risk: 'Exposed cameras often have default or no credentials.'
	},
	{
		port: 587,
		proto: 'tcp',
		iana: 'submission',
		name: 'SMTP submission',
		desc: 'Mail submission by clients, STARTTLS (RFC 6409)'
	},
	{
		port: 623,
		proto: 'udp',
		iana: 'asf-rmcp',
		name: 'IPMI',
		desc: 'IPMI over LAN (RMCP), server BMCs',
		risk: 'IPMI 2.0 leaks password hashes by design (RAKP). Isolate BMCs on a management network.'
	},
	{
		port: 631,
		proto: 'tcp',
		iana: 'ipp',
		name: 'IPP',
		desc: 'Internet Printing Protocol, CUPS',
		risk: 'CUPS browsing (UDP 631) had remote code execution flaws in 2024. Do not expose.'
	},
	{ port: 636, proto: 'tcp', iana: 'ldaps', name: 'LDAPS', desc: 'LDAP over TLS' },
	{
		port: 853,
		proto: 'tcp/udp',
		iana: 'domain-s',
		name: 'DNS over TLS',
		desc: 'DNS over TLS (RFC 7858), DNS over QUIC on UDP (RFC 9250)'
	},
	{
		port: 873,
		proto: 'tcp',
		iana: 'rsync',
		name: 'rsync',
		desc: 'rsync daemon',
		risk: 'Anonymous modules leak data. Restrict or tunnel over SSH.'
	},
	{
		port: 902,
		proto: 'tcp/udp',
		name: 'VMware ESXi',
		desc: 'VMware ESXi host agent, console and NFC',
		common: true,
		risk: 'Hypervisor management. Keep on a management network.'
	},
	{
		port: 989,
		proto: 'tcp',
		iana: 'ftps-data',
		name: 'FTPS data',
		desc: 'FTP data over implicit TLS'
	},
	{ port: 990, proto: 'tcp', iana: 'ftps', name: 'FTPS', desc: 'FTP control over implicit TLS' },
	{ port: 993, proto: 'tcp', iana: 'imaps', name: 'IMAPS', desc: 'IMAP over TLS' },
	{ port: 995, proto: 'tcp', iana: 'pop3s', name: 'POP3S', desc: 'POP3 over TLS' },
	{
		port: 1080,
		proto: 'tcp',
		iana: 'socks',
		name: 'SOCKS',
		desc: 'SOCKS proxy',
		risk: 'An open proxy will be found and abused within hours.'
	},
	{
		port: 1099,
		proto: 'tcp',
		iana: 'rmiregistry',
		name: 'Java RMI',
		desc: 'Java RMI registry',
		risk: 'Deserialisation attacks. Never expose.'
	},
	{ port: 1194, proto: 'tcp/udp', iana: 'openvpn', name: 'OpenVPN', desc: 'OpenVPN' },
	{
		port: 1433,
		proto: 'tcp',
		iana: 'ms-sql-s',
		name: 'SQL Server',
		desc: 'Microsoft SQL Server',
		risk: 'Databases should never face the internet; sa brute force is constant.'
	},
	{
		port: 1434,
		proto: 'udp',
		iana: 'ms-sql-m',
		name: 'SQL Server Browser',
		desc: 'SQL Server instance discovery',
		risk: 'SQL Slammer (2003); amplification. Block at the edge.'
	},
	{
		port: 1521,
		proto: 'tcp',
		name: 'Oracle DB',
		desc: 'Oracle Database listener',
		common: true,
		risk: 'Databases should never face the internet.'
	},
	{
		port: 1701,
		proto: 'udp',
		iana: 'l2tp',
		name: 'L2TP',
		desc: 'Layer 2 Tunneling Protocol, usually inside IPsec'
	},
	{
		port: 1723,
		proto: 'tcp',
		iana: 'pptp',
		name: 'PPTP',
		desc: 'Point-to-Point Tunneling Protocol VPN',
		risk: 'MS-CHAPv2 is broken. Replace PPTP.'
	},
	{
		port: 1812,
		proto: 'udp',
		iana: 'radius',
		name: 'RADIUS',
		desc: 'RADIUS authentication (1645 on old gear)'
	},
	{
		port: 1813,
		proto: 'udp',
		iana: 'radius-acct',
		name: 'RADIUS accounting',
		desc: 'RADIUS accounting (1646 on old gear)'
	},
	{
		port: 1883,
		proto: 'tcp',
		iana: 'mqtt',
		name: 'MQTT',
		desc: 'MQTT messaging, IoT',
		risk: 'Often deployed without authentication or TLS. Use 8883 and credentials.'
	},
	{
		port: 1900,
		proto: 'udp',
		iana: 'ssdp',
		name: 'SSDP / UPnP',
		desc: 'UPnP device discovery',
		risk: 'Large amplification factor; UPnP can open router ports. Never expose, disable UPnP on edge routers.'
	},
	{
		port: 2049,
		proto: 'tcp/udp',
		iana: 'nfs',
		name: 'NFS',
		desc: 'Network File System',
		risk: 'Host-based trust by default. Keep inside the network.'
	},
	{
		port: 2181,
		proto: 'tcp',
		name: 'ZooKeeper',
		desc: 'Apache ZooKeeper client port',
		common: true,
		risk: 'No authentication by default.'
	},
	{
		port: 2375,
		proto: 'tcp',
		iana: 'docker',
		name: 'Docker API',
		desc: 'Docker Engine API, plain HTTP',
		risk: 'Unauthenticated root on the host. Never listen on a network interface; use the socket or 2376 with mutual TLS.'
	},
	{
		port: 2376,
		proto: 'tcp',
		iana: 'docker-s',
		name: 'Docker API, TLS',
		desc: 'Docker Engine API over TLS',
		risk: 'Require client certificates.'
	},
	{
		port: 2379,
		proto: 'tcp',
		iana: 'etcd-client',
		name: 'etcd client',
		desc: 'etcd client API, Kubernetes state store',
		risk: 'Holds every Kubernetes secret. Mutual TLS and no external access.'
	},
	{
		port: 2380,
		proto: 'tcp',
		iana: 'etcd-server',
		name: 'etcd peer',
		desc: 'etcd peer communication'
	},
	{
		port: 3000,
		proto: 'tcp',
		name: 'Grafana / dev servers',
		desc: 'Grafana default, many Node.js dev servers',
		common: true
	},
	{
		port: 3128,
		proto: 'tcp',
		name: 'Squid',
		desc: 'Squid HTTP proxy default',
		common: true,
		risk: 'An open proxy will be abused.'
	},
	{
		port: 3260,
		proto: 'tcp',
		iana: 'iscsi-target',
		name: 'iSCSI',
		desc: 'iSCSI storage targets',
		risk: 'Block storage; isolate on a storage network, use CHAP.'
	},
	{
		port: 3268,
		proto: 'tcp',
		iana: 'msft-gc',
		name: 'AD Global Catalog',
		desc: 'Active Directory Global Catalog (LDAP)'
	},
	{
		port: 3269,
		proto: 'tcp',
		iana: 'msft-gc-ssl',
		name: 'AD Global Catalog, TLS',
		desc: 'Active Directory Global Catalog over TLS'
	},
	{
		port: 3306,
		proto: 'tcp',
		iana: 'mysql',
		name: 'MySQL',
		desc: 'MySQL and MariaDB',
		risk: 'Databases should never face the internet.'
	},
	{
		port: 3389,
		proto: 'tcp/udp',
		iana: 'ms-wbt-server',
		name: 'RDP',
		desc: 'Remote Desktop Protocol',
		risk: 'Top ransomware entry point (brute force, BlueKeep). Put it behind a VPN or RD Gateway with MFA; require NLA.'
	},
	{
		port: 3478,
		proto: 'tcp/udp',
		iana: 'stun',
		name: 'STUN / TURN',
		desc: 'NAT traversal for WebRTC and VoIP'
	},
	{ port: 3690, proto: 'tcp', iana: 'svn', name: 'Subversion', desc: 'svnserve' },
	{
		port: 4369,
		proto: 'tcp',
		iana: 'epmd',
		name: 'Erlang EPMD',
		desc: 'Erlang port mapper, RabbitMQ and CouchDB clusters',
		risk: 'Combined with a weak Erlang cookie gives code execution. Keep internal.'
	},
	{
		port: 4500,
		proto: 'udp',
		iana: 'ipsec-nat-t',
		name: 'IPsec NAT-T',
		desc: 'IPsec NAT traversal'
	},
	{
		port: 4789,
		proto: 'udp',
		iana: 'vxlan',
		name: 'VXLAN',
		desc: 'VXLAN overlay networks (RFC 7348)'
	},
	{
		port: 5000,
		proto: 'tcp',
		name: 'Dev servers, NAS',
		desc: 'Flask dev server, Synology DSM, macOS AirPlay receiver',
		common: true
	},
	{
		port: 5060,
		proto: 'tcp/udp',
		iana: 'sip',
		name: 'SIP',
		desc: 'VoIP signalling',
		risk: 'Constant scanning for toll fraud. Restrict to your provider.'
	},
	{
		port: 5061,
		proto: 'tcp',
		iana: 'sips',
		name: 'SIP over TLS',
		desc: 'VoIP signalling over TLS'
	},
	{
		port: 5222,
		proto: 'tcp',
		iana: 'xmpp-client',
		name: 'XMPP client',
		desc: 'XMPP (Jabber) client connections'
	},
	{
		port: 5269,
		proto: 'tcp',
		iana: 'xmpp-server',
		name: 'XMPP server',
		desc: 'XMPP server-to-server'
	},
	{
		port: 5353,
		proto: 'udp',
		iana: 'mdns',
		name: 'mDNS',
		desc: 'Multicast DNS, Bonjour and Avahi',
		risk: 'Link-local only. Answering from the internet leaks names and amplifies.'
	},
	{
		port: 5355,
		proto: 'tcp/udp',
		iana: 'llmnr',
		name: 'LLMNR',
		desc: 'Link-Local Multicast Name Resolution, Windows',
		risk: 'Poisoned by Responder to steal NTLM hashes. Disable via Group Policy.'
	},
	{
		port: 5432,
		proto: 'tcp',
		iana: 'postgresql',
		name: 'PostgreSQL',
		desc: 'PostgreSQL',
		risk: 'Databases should never face the internet.'
	},
	{
		port: 5601,
		proto: 'tcp',
		name: 'Kibana',
		desc: 'Kibana web UI default',
		common: true,
		risk: 'Exposed dashboards leak logs. Put behind authentication.'
	},
	{ port: 5671, proto: 'tcp', iana: 'amqps', name: 'AMQPS', desc: 'AMQP over TLS, RabbitMQ' },
	{ port: 5672, proto: 'tcp', iana: 'amqp', name: 'AMQP', desc: 'AMQP, RabbitMQ' },
	{
		port: 5683,
		proto: 'udp',
		iana: 'coap',
		name: 'CoAP',
		desc: 'Constrained Application Protocol, IoT',
		risk: 'Used for amplification. Do not expose.'
	},
	{
		port: 5900,
		proto: 'tcp',
		iana: 'rfb',
		name: 'VNC',
		desc: 'Remote Frame Buffer (VNC), display :0; 5901 for :1 and so on',
		risk: 'Weak or no passwords are common; traffic often unencrypted. Tunnel it, never expose.'
	},
	{
		port: 5985,
		proto: 'tcp',
		iana: 'wsman',
		name: 'WinRM HTTP',
		desc: 'Windows Remote Management (WS-Management) over HTTP',
		risk: 'PowerShell remoting. Internal management networks only.'
	},
	{
		port: 5986,
		proto: 'tcp',
		iana: 'wsmans',
		name: 'WinRM HTTPS',
		desc: 'Windows Remote Management over HTTPS',
		risk: 'Internal management networks only.'
	},
	{
		port: 6000,
		to: 6063,
		proto: 'tcp',
		iana: 'x11',
		name: 'X11',
		desc: 'X Window System, display :0 at 6000',
		risk: 'An open X server lets anyone read keystrokes. Use SSH forwarding.'
	},
	{
		port: 6379,
		proto: 'tcp',
		iana: 'redis',
		name: 'Redis',
		desc: 'Redis',
		risk: 'No authentication by default; exposed instances are hijacked for cryptomining. Bind to localhost.'
	},
	{
		port: 6443,
		proto: 'tcp',
		name: 'Kubernetes API',
		desc: 'Kubernetes API server default',
		common: true,
		risk: 'Restrict to admin networks; anonymous auth off.'
	},
	{
		port: 6514,
		proto: 'tcp',
		iana: 'syslog-tls',
		name: 'Syslog over TLS',
		desc: 'Syslog over TLS (RFC 5425)'
	},
	{
		port: 6665,
		to: 6669,
		proto: 'tcp',
		iana: 'ircu',
		name: 'IRC',
		desc: 'Internet Relay Chat, 6667 most common; 6697 for TLS'
	},
	{
		port: 8000,
		proto: 'tcp',
		name: 'HTTP alternative',
		desc: 'Development web servers',
		common: true
	},
	{
		port: 8080,
		proto: 'tcp',
		iana: 'http-alt',
		name: 'HTTP alternative',
		desc: 'Proxies, Tomcat, Jenkins, admin panels',
		risk: 'Often an admin interface someone forgot about.'
	},
	{ port: 8086, proto: 'tcp', name: 'InfluxDB', desc: 'InfluxDB HTTP API', common: true },
	{ port: 8200, proto: 'tcp', name: 'Vault', desc: 'HashiCorp Vault API', common: true },
	{
		port: 8291,
		proto: 'tcp',
		name: 'MikroTik Winbox',
		desc: 'MikroTik RouterOS management',
		common: true,
		risk: 'Exploited at scale (2018). Never expose router management.'
	},
	{
		port: 8443,
		proto: 'tcp',
		name: 'HTTPS alternative',
		desc: 'Admin consoles, Tomcat TLS, UniFi controller',
		common: true
	},
	{
		port: 8500,
		proto: 'tcp',
		name: 'Consul',
		desc: 'HashiCorp Consul HTTP API',
		common: true,
		risk: 'Script checks enabled plus no ACLs gives remote code execution.'
	},
	{ port: 8883, proto: 'tcp', iana: 'secure-mqtt', name: 'MQTT over TLS', desc: 'MQTT over TLS' },
	{
		port: 9090,
		proto: 'tcp',
		name: 'Prometheus',
		desc: 'Prometheus server; also Cockpit on Linux',
		common: true,
		risk: 'Unauthenticated metrics and targets leak your infrastructure.'
	},
	{ port: 9092, proto: 'tcp', name: 'Kafka', desc: 'Apache Kafka broker', common: true },
	{ port: 9093, proto: 'tcp', name: 'Alertmanager', desc: 'Prometheus Alertmanager', common: true },
	{
		port: 9100,
		proto: 'tcp',
		name: 'Node exporter / raw printing',
		desc: 'Prometheus node exporter; also raw printing (HP JetDirect, "port 9100")',
		common: true,
		risk: 'Printers on 9100 accept any job, and PJL can read their file systems.'
	},
	{
		port: 9200,
		proto: 'tcp',
		name: 'Elasticsearch',
		desc: 'Elasticsearch REST API (9300 for node transport)',
		common: true,
		risk: 'Exposed clusters without security have leaked billions of records.'
	},
	{
		port: 9418,
		proto: 'tcp',
		iana: 'git',
		name: 'Git',
		desc: 'Git protocol (git://), read-only, unauthenticated'
	},
	{
		port: 10000,
		proto: 'tcp',
		name: 'Webmin',
		desc: 'Webmin administration',
		common: true,
		risk: 'Admin panel with a history of remote code execution flaws.'
	},
	{
		port: 10250,
		proto: 'tcp',
		name: 'Kubelet API',
		desc: 'Kubernetes kubelet API',
		common: true,
		risk: 'With anonymous auth on, gives exec into every pod on the node.'
	},
	{
		port: 11211,
		proto: 'tcp/udp',
		iana: 'memcache',
		name: 'Memcached',
		desc: 'Memcached',
		risk: 'UDP gave the 1.7 Tbit/s amplification attacks of 2018. Disable UDP, never expose.'
	},
	{
		port: 15672,
		proto: 'tcp',
		name: 'RabbitMQ management',
		desc: 'RabbitMQ management UI and API',
		common: true,
		risk: 'Default guest/guest only works from localhost; keep it that way.'
	},
	{
		port: 20000,
		proto: 'tcp/udp',
		iana: 'dnp',
		name: 'DNP3',
		desc: 'DNP3, utility SCADA',
		risk: 'Industrial control. Never reachable from the internet.'
	},
	{
		port: 25565,
		proto: 'tcp',
		name: 'Minecraft',
		desc: 'Minecraft Java Edition server',
		common: true
	},
	{
		port: 27017,
		proto: 'tcp',
		iana: 'mongodb',
		name: 'MongoDB',
		desc: 'MongoDB',
		risk: 'Old defaults listened on all interfaces with no auth; mass ransom wipes in 2017. Bind locally, enable auth.'
	},
	{
		port: 30000,
		to: 32767,
		proto: 'tcp/udp',
		name: 'Kubernetes NodePort',
		desc: 'Default Kubernetes NodePort service range',
		common: true
	},
	{
		port: 44818,
		proto: 'tcp/udp',
		name: 'EtherNet/IP',
		desc: 'EtherNet/IP (CIP), industrial control',
		common: true,
		risk: 'Industrial control. Never reachable from the internet.'
	},
	{
		port: 47808,
		proto: 'udp',
		name: 'BACnet',
		desc: 'BACnet/IP building automation',
		common: true,
		risk: 'Building control. Never reachable from the internet.'
	},
	{
		port: 49152,
		to: 65535,
		proto: 'tcp/udp',
		name: 'Dynamic ports',
		desc: 'Dynamic and private range (RFC 6335); Windows uses it for ephemeral and RPC ports',
		common: true
	},
	{
		port: 51820,
		proto: 'udp',
		name: 'WireGuard',
		desc: 'WireGuard default listen port',
		common: true
	}
];
