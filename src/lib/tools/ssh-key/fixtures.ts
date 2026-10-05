/*
 * Fixtures generated with ssh-keygen from OpenSSH 9.6p1 (Ubuntu). Each entry has the public key
 * line and the output of `ssh-keygen -lf` and `ssh-keygen -E md5 -lf` for it, copied verbatim.
 * The two -sk keys were assembled by hand (no FIDO token available) from the documented blob
 * layout (OpenSSH PROTOCOL.u2f), then fingerprinted with ssh-keygen like the others.
 * The certificates were signed with `ssh-keygen -s ca -I ... -n ... -V 20260101000000:20270101000000`.
 * These are throwaway keys; the private halves were deleted.
 */

export interface SshFixture {
	name: string;
	line: string;
	/** ssh-keygen -lf */
	sha256: string;
	/** ssh-keygen -E md5 -lf */
	md5: string;
}

export const fixtures: SshFixture[] = [
	{
		name: 'rsa1024',
		line: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAAgQC0dr75WLHm7v/rnYoP3DY16IPKT5y15qWwSik5n+3HV9hiw/+Twa3YErk44Q7hPhohxNvQaC1lDFCar5OckaEaTvv/VigVClBhOQ3m/YAQMajD0RcIECb9i08GfVIKxAabUTtzqv97EF+BdvCIryEHzQZw8f3It2WImjLq6WvmJw== rsa1024',
		sha256: '1024 SHA256:ondLee3UR+YqDXSe0FN3KU2aPaYziWTbyx/ZBI4DJ0I rsa1024 (RSA)',
		md5: '1024 MD5:a9:10:f4:8f:81:0e:a2:f3:41:a2:a8:b1:6e:a9:44:9e rsa1024 (RSA)'
	},
	{
		name: 'rsa2048',
		line: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCyjXG8V+pEEdcoSuP04LcjEIchgmabEuG8mjo2L251IKpJq+HyVtBkTcaFK8/NxNrbwGbSpYUVPLU3fzEJ11ipFrrti/36jXBRqdCxSwYo607t6ZL0moWaemnnmmJ3SHJ1OkBD2nQmNg4jdKQ6imW5wWfj2KQL/vDaFbnAACC44oIHMvbvTno35g4MYjwOwGAPl9ms2zBR9vSKlQ01njJrspwhGw820xpte2N18VXE9FDNZXsTI4t5IGfSL/93V6AvauR9nXvkrq+VACH0IrQ1ihCHUDP5eLVHUhA2QV7yNh4WZvwf62TsIhRtsBFh1ROc2oBh5sBA7fvZcPIPRjm1 rsa2048@fixture',
		sha256: '2048 SHA256:wq2WcPNyZGF4BMSk1dMl8WA/1LFWiFW6orGOgxKL3h4 rsa2048@fixture (RSA)',
		md5: '2048 MD5:0b:31:58:70:6b:b0:69:ee:09:d4:d4:53:57:e1:95:0b rsa2048@fixture (RSA)'
	},
	{
		name: 'rsa3072',
		line: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC8PCFT7nHayUmvSg4ZzAS2SGIqw22LPM2Dn7fsrCEtDYifu4f9CyOLUJyOvRclFKz9ukmzON1SPJocVy1hIKyuIc9NvzXL1D8FbYOu3F6MjrDj8DJqut5JLEbcYUVideH4qc3om5+9dXR03Do1cByIs9Go1hG2ZFAqLJKRO6IsMZae5yPlhQ3+/AlBB+eTTs/02WqGmQWC9E3/q5oYMI5DXxKDq5uH2faw8W8dtSTU2j0sUWpTdsyiuLQKC4va+j8X8kiQTglhv5J0HsanFVD1kPFrm6ArCf+l/4hnkEU8o0CMbdQf1SIjeWJ1T07cxYvePYcVCaijOVbk9EDW3Fi6eoe2vAY1dP2eHl1d6ezUb5/VXj/CrBy1Kb7uQkKXEkslsV9mkh4NKs8UPp/iiJEMrxanuNhfVasHixeG/IfhZ2GFUT3NCWgenc6AJAaSXnb3ME/w0zk0YPNmoSokNJIFoVTZSwsq40F9JUhwrTMPKjTqaYjKZ7KqG5vPe3T9bJ0= rsa3072@fixture',
		sha256: '3072 SHA256:M+fxJg1Xz++zonYOe2OmIK7ZgtOCpMkctWgxliRsPnQ rsa3072@fixture (RSA)',
		md5: '3072 MD5:bd:8d:cc:7c:39:82:82:df:c6:25:89:1b:31:38:c3:f1 rsa3072@fixture (RSA)'
	},
	{
		name: 'dsa',
		line: 'ssh-dss AAAAB3NzaC1kc3MAAACBAK6BRJlFdJi1Emhg8RBYA5cB+L1ydhquECAOHkWRl7FcgheOdsLGnDnV2oZq/XAGSnLQdZCFf4h1zfmm0MtRdoIJwDIjScP4X4IOYOVb6/nA1ZkZVlPjKMne00/UbQclOaurLKNz6ZvR10IjpJsNgr7PYiJxACX4iSllQRtp8KrbAAAAFQDHVgBM2ZXUqFpllxYs0HcsRffcyQAAAIAnCYSY/jntiN5773acGYmxY7u7oFv0Kwns76EJonhMCC+X0H9zUKgUEgKzPGuv3PbryvVE0ZcfIiguMS2nTtHQFdLKy19WvgcxpGWway0zqTT6A2c8GKPVFgzRAl6lfU6spOAqdTgM4j/c5pEy7ttvKba601bKKOfblNsKLkPTnQAAAIBOLEUypfc0R+XJwuSwXCazGSFaPLwAlGnvnS9kAaFfVk+OWogeh4fouHLKxAslyHB3+4rRcP903UPizz6rA2x+tzGdMmCJaqgcm8nlGFn/3uauUcohQNviYC/Ipr594A/ylCZQE4FpymLT1VIyu1aOEg0FfpvRoRwzrL4vV3GDhw== dsa',
		sha256: '1024 SHA256:bH/AGQ0hri/uur1O1/qgiucXRszd/N7xkGsGU8LA52s dsa (DSA)',
		md5: '1024 MD5:08:1e:d3:a5:b2:fc:b2:c5:07:1f:d3:c9:cd:f7:87:7a dsa (DSA)'
	},
	{
		name: 'e256',
		line: 'ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBEVpGcCDvptuh4SQYNYMvwJGKUih8YnJFtcc/7JAatwoQNBXoYcquaC4+lWxdViR3Iyjyv7wQ7nOZzLfRWoZ7T4= p256',
		sha256: '256 SHA256:q7HX7oUiz7R/sAtZg7kAN+McPFYW5szlsxVj+HJcKgg p256 (ECDSA)',
		md5: '256 MD5:da:1e:0e:f7:8e:95:aa:2f:80:db:80:63:d6:8b:64:e5 p256 (ECDSA)'
	},
	{
		name: 'e384',
		line: 'ecdsa-sha2-nistp384 AAAAE2VjZHNhLXNoYTItbmlzdHAzODQAAAAIbmlzdHAzODQAAABhBPmF7Cy4s5fIoT7vJ7E6sDP8i53qky7V9I1Y4kG1lFOjxlazf8cHf2ZL2prBJTodSyGEltBkrBlbC8IHr5TzQccCvCVUX83QoZBOAQ0fDRstgoMHbxijLdtz7J3EYyt+nA== p384',
		sha256: '384 SHA256:OhXqDfDTaoHJRVDGjA5HkSEPqO3KqRghOStP+mKyCkE p384 (ECDSA)',
		md5: '384 MD5:fc:67:ee:03:93:26:75:48:9c:b8:1d:f7:05:68:39:11 p384 (ECDSA)'
	},
	{
		name: 'e521',
		line: 'ecdsa-sha2-nistp521 AAAAE2VjZHNhLXNoYTItbmlzdHA1MjEAAAAIbmlzdHA1MjEAAACFBAAjtieU9FSBtyEkZczm3XYyq0UaTnumQAUDHV7S2hMuZouULSlDTdWGQZyv/V2b0PvQkq9PxRuBS19L1qLFAxxJqgAfJrqHIDKtcHdLAudCyC5lE01D3aX4lkhYhG0pq8fx5uIq8ykq1Hm7P5iIXfhYBx3rL+7Or6TlghehBc32+EH1QA== p521',
		sha256: '521 SHA256:PcwBmTw6GVLDiznwcuYaUNWzWdSJhxGX5qAiIUqBWrs p521 (ECDSA)',
		md5: '521 MD5:37:f5:d7:3e:cb:02:6c:b5:7e:42:b9:a3:55:94:dd:ff p521 (ECDSA)'
	},
	{
		name: 'ed',
		line: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBU+ORBRWK6Ippk1SZlsPQkaX1HGIbuNCN9OL+aZcMCw ed@fixture',
		sha256: '256 SHA256:4zOyKRmdp4Eep/9G9CZ82wYO4ePPYBDassepRAFMwBQ ed@fixture (ED25519)',
		md5: '256 MD5:cd:ff:7e:80:40:b5:ff:ef:00:79:13:77:d4:15:d4:00 ed@fixture (ED25519)'
	},
	{
		name: 'sked',
		line: 'sk-ssh-ed25519@openssh.com AAAAGnNrLXNzaC1lZDI1NTE5QG9wZW5zc2guY29tAAAAIAABAgMEBQYHCAkKCwwNDg8QERITFBUWFxgZGhscHR4fAAAABHNzaDo= sk-ed',
		sha256: '256 SHA256:/p0CbeE3dk2SyW1OXXsThGc12ezDVD8eGw2/vtztDfk sk-ed (ED25519-SK)',
		md5: '256 MD5:cf:44:e4:6b:27:42:ed:24:a2:8a:c7:78:81:89:dc:78 sk-ed (ED25519-SK)'
	},
	{
		name: 'ske',
		line: 'sk-ecdsa-sha2-nistp256@openssh.com AAAAInNrLWVjZHNhLXNoYTItbmlzdHAyNTZAb3BlbnNzaC5jb20AAAAIbmlzdHAyNTYAAABBBEVpGcCDvptuh4SQYNYMvwJGKUih8YnJFtcc/7JAatwoQNBXoYcquaC4+lWxdViR3Iyjyv7wQ7nOZzLfRWoZ7T4AAAAEc3NoOg== sk-ec',
		sha256: '256 SHA256:TpE+4D2Xum9xgcVOErvc34JyGS3dvszmUyq2wuN4eWw sk-ec (ECDSA-SK)',
		md5: '256 MD5:39:56:89:21:2c:0a:88:99:24:66:c5:cd:a8:4c:53:8e sk-ec (ECDSA-SK)'
	},
	{
		name: 'ed-cert',
		line: 'ssh-ed25519-cert-v01@openssh.com AAAAIHNzaC1lZDI1NTE5LWNlcnQtdjAxQG9wZW5zc2guY29tAAAAIHvChfFPMFvApvO4c405YdvKAT1bZRjVBj+gbKjcrSG9AAAAIBU+ORBRWK6Ippk1SZlsPQkaX1HGIbuNCN9OL+aZcMCwAAAAAAAAACoAAAABAAAADGFsaWNlLWxhcHRvcAAAABIAAAAFYWxpY2UAAAAFYWRtaW4AAAAAaVW5AAAAAABrNuyAAAAAAAAAAIIAAAAVcGVybWl0LVgxMS1mb3J3YXJkaW5nAAAAAAAAABdwZXJtaXQtYWdlbnQtZm9yd2FyZGluZwAAAAAAAAAWcGVybWl0LXBvcnQtZm9yd2FyZGluZwAAAAAAAAAKcGVybWl0LXB0eQAAAAAAAAAOcGVybWl0LXVzZXItcmMAAAAAAAAAAAAAADMAAAALc3NoLWVkMjU1MTkAAAAgUTGibY1lU/LrLbT7SoOmEORYUpc6+CGFM/wDNjEbWV8AAABTAAAAC3NzaC1lZDI1NTE5AAAAQNu0wfkH8xhBmu4HxgC4kBZjbsfthO+VVe957BnKlz8LbSY87oNq6GDFKLRvB0sbxO2ZyFBBsHD+DMPLkuQrRgQ= ed@fixture',
		sha256: '256 SHA256:4zOyKRmdp4Eep/9G9CZ82wYO4ePPYBDassepRAFMwBQ ed@fixture (ED25519-CERT)',
		md5: '256 MD5:cd:ff:7e:80:40:b5:ff:ef:00:79:13:77:d4:15:d4:00 ed@fixture (ED25519-CERT)'
	},
	{
		name: 'rsa3072-cert',
		line: 'ssh-rsa-cert-v01@openssh.com AAAAHHNzaC1yc2EtY2VydC12MDFAb3BlbnNzaC5jb20AAAAgpTbKb33hrVKUxfWdhpCARd3hZV2pIZEQsum2k5CN3aAAAAADAQABAAABgQC8PCFT7nHayUmvSg4ZzAS2SGIqw22LPM2Dn7fsrCEtDYifu4f9CyOLUJyOvRclFKz9ukmzON1SPJocVy1hIKyuIc9NvzXL1D8FbYOu3F6MjrDj8DJqut5JLEbcYUVideH4qc3om5+9dXR03Do1cByIs9Go1hG2ZFAqLJKRO6IsMZae5yPlhQ3+/AlBB+eTTs/02WqGmQWC9E3/q5oYMI5DXxKDq5uH2faw8W8dtSTU2j0sUWpTdsyiuLQKC4va+j8X8kiQTglhv5J0HsanFVD1kPFrm6ArCf+l/4hnkEU8o0CMbdQf1SIjeWJ1T07cxYvePYcVCaijOVbk9EDW3Fi6eoe2vAY1dP2eHl1d6ezUb5/VXj/CrBy1Kb7uQkKXEkslsV9mkh4NKs8UPp/iiJEMrxanuNhfVasHixeG/IfhZ2GFUT3NCWgenc6AJAaSXnb3ME/w0zk0YPNmoSokNJIFoVTZSwsq40F9JUhwrTMPKjTqaYjKZ7KqG5vPe3T9bJ0AAAAAAAAABwAAAAIAAAAIcnNhLWhvc3QAAAAUAAAAEGhvc3QuZXhhbXBsZS5jb20AAAAAaVW5AAAAAABrNuyAAAAAAAAAAAAAAAAAAAAAMwAAAAtzc2gtZWQyNTUxOQAAACBRMaJtjWVT8usttPtKg6YQ5FhSlzr4IYUz/AM2MRtZXwAAAFMAAAALc3NoLWVkMjU1MTkAAABAMJfW1IwaKMEYWeQlUUGrI/4qkAthJnm/BsJgFRK5APWgeUxfPaneMyPw/NgMzFvFGfnGv3UfjIdT/9JIy7CRBQ== rsa3072@fixture',
		sha256: '3072 SHA256:M+fxJg1Xz++zonYOe2OmIK7ZgtOCpMkctWgxliRsPnQ rsa3072@fixture (RSA-CERT)',
		md5: '3072 MD5:bd:8d:cc:7c:39:82:82:df:c6:25:89:1b:31:38:c3:f1 rsa3072@fixture (RSA-CERT)'
	}
];

/** `ssh-keygen -H` of: "example.com,192.0.2.1 <ed>" and "[example.com]:2222 <e256>". */
export const hashedKnownHosts =
	'|1|5EWpb5ii+9z/oGTYWE+CZ5P2BAw=|fJGFi1DXkeKg1U9zFuyREru2hhM= ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBU+ORBRWK6Ippk1SZlsPQkaX1HGIbuNCN9OL+aZcMCw\n|1|y3Y0K6W/fN1oNbdfgdFvpULyg98=|HlCkU2ipU9Qy1EGx5M1fh/39dAM= ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBU+ORBRWK6Ippk1SZlsPQkaX1HGIbuNCN9OL+aZcMCw\n|1|rVCoiYfbATUbfJ2FORs4EQdwdq8=|4dF2zshG1BLycy5wKsd/x+ChnUk= ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBEVpGcCDvptuh4SQYNYMvwJGKUih8YnJFtcc/7JAatwoQNBXoYcquaC4+lWxdViR3Iyjyv7wQ7nOZzLfRWoZ7T4=\n';
