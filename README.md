# XRail Panel — Zero Config Railway Edition

## Deploy
1. Push all files to a GitHub repository.
2. Deploy the repository on Railway. No custom Variables are required.
3. Generate an HTTP domain.
4. Recommended: attach one Railway Volume with mount path `/data`. The app automatically reads Railway's `RAILWAY_VOLUME_MOUNT_PATH`.
5. Open the domain. On first run, choose your admin username/password.

Railway automatically supplies its own public-domain, volume and TCP-proxy variables; this project consumes them when available.

## Xray networking
The administration panel itself needs no custom environment variables. A raw Xray service still requires a Railway TCP Proxy because HTTP public networking cannot expose arbitrary Xray TCP traffic. Create a TCP Proxy to internal port `10000`. Railway automatically supplies `RAILWAY_TCP_PROXY_DOMAIN` and `RAILWAY_TCP_PROXY_PORT`.

The included core runner remains opt-in in this edition; enabling multiple Xray protocols on Railway should be done with explicit inbound/network configuration rather than pretending one raw TCP port supports every protocol simultaneously.

Use only on systems/networks you are authorized to administer.
