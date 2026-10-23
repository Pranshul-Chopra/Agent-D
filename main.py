"""
main.py — Agent-D entry point.
Flask runs as a local HTTP server bound to an available port (cascading from 5050 to 5065).
The desktop shell is managed by Electron (electron/main.js) via cascading handshake.
"""

import os
import sys
import threading
import time
import socket
import json
import urllib.parse
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))

from flask import Flask
import db
import config_db
import context_db
import routes

FLASK_HOST = "127.0.0.1"
DEFAULT_PORT = int(os.getenv("DC_PORT", os.getenv("PM_TOOL_PORT", "5050")))
CANDIDATE_PORTS = [DEFAULT_PORT] + [p for p in range(5051, 5066) if p != DEFAULT_PORT]


def get_runtime_port_file() -> Path:
    """Path to the runtime port handshake file stored in local app data."""
    base = os.getenv("LOCALAPPDATA") or str(Path.home() / ".agentd")
    p = Path(base) / "AgentD"
    p.mkdir(parents=True, exist_ok=True)
    return p / "runtime_port.json"


def write_runtime_handshake(port: int, host: str = "127.0.0.1"):
    """Write active port handshake metadata for Electron and external clients."""
    info = {
        "app": "agent_d",
        "port": port,
        "host": host,
        "url": f"http://{host}:{port}",
        "pid": os.getpid(),
        "timestamp": time.time(),
    }
    try:
        get_runtime_port_file().write_text(json.dumps(info, indent=2), encoding="utf-8")
    except Exception:
        pass
    # Print clear handshake signal to stdout for Electron child_process listener
    print(f"[DC_HANDSHAKE] PORT={port} URL=http://{host}:{port}", flush=True)


def is_port_available(port: int, host: str = "127.0.0.1") -> bool:
    """Check if a port can be bound on the specified host."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind((host, port))
            return True
        except (OSError, socket.error):
            return False


def find_available_port(host: str = "127.0.0.1") -> int:
    """Cascade through candidate ports until an unbound port is found."""
    # 1. If explicit PM_TOOL_PORT environment variable was set, check it first
    env_port = os.getenv("PM_TOOL_PORT")
    if env_port:
        try:
            p = int(env_port)
            if is_port_available(p, host):
                return p
            print(f"[PM_TOOL] Requested port {p} is in use; cascading to candidate ports...")
        except ValueError:
            pass

    # 2. Cascade through priority candidate ports
    for p in CANDIDATE_PORTS:
        if is_port_available(p, host):
            return p

    # 3. Fallback: let OS assign an ephemeral port
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((host, 0))
        return s.getsockname()[1]


FLASK_PORT = find_available_port(FLASK_HOST)
FLASK_PING_URL = f"http://{FLASK_HOST}:{FLASK_PORT}/api/ping"


def _get_base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return Path(__file__).resolve().parent


def create_app() -> Flask:
    base_dir = _get_base_dir()
    templates_dir = str(base_dir / "templates")
    static_dir = str(base_dir / "static")
    app = Flask(__name__, template_folder=templates_dir, static_folder=static_dir)
    app.config["MAX_CONTENT_LENGTH"] = 32 * 1024 * 1024
    app.config["TEMPLATES_AUTO_RELOAD"] = True

    @app.before_request
    def validate_origin():
        from flask import request, jsonify

        # 1. DNS Rebinding Protection: Verify Host header resolves strictly to local loopback
        host_name = request.host.split(":")[0].strip().lower()
        if host_name not in ("127.0.0.1", "localhost"):
            return jsonify({"error": "Forbidden: unauthorized Host header (DNS rebinding protection)"}), 403

        # 2. Sec-Fetch-Site Header Check (blocks cross-site attacks from external web pages)
        sec_site = request.headers.get("Sec-Fetch-Site")
        if sec_site == "cross-site":
            return jsonify({"error": "Forbidden cross-origin request"}), 403

        # 3. Origin Header Validation
        origin = request.headers.get("Origin")
        if origin:
            parsed = urllib.parse.urlparse(origin)
            if parsed.hostname not in ("127.0.0.1", "localhost"):
                return jsonify({"error": "Forbidden cross-origin request"}), 403

        # 4. Referer Header Validation (detects external navigation or embedding attempts)
        referer = request.headers.get("Referer")
        if referer:
            parsed_ref = urllib.parse.urlparse(referer)
            if parsed_ref.hostname and parsed_ref.hostname not in ("127.0.0.1", "localhost"):
                return jsonify({"error": "Forbidden cross-origin referer"}), 403

        # 5. Bearer Token Authentication for local API endpoints (except ping)
        if request.path.startswith("/api/") and request.path != "/api/ping":
            expected_token = os.getenv("AGENT_D_AUTH_TOKEN")
            if expected_token:
                auth_header = request.headers.get("Authorization", "")
                if auth_header != f"Bearer {expected_token}":
                    return jsonify({"error": "Unauthorized: invalid or missing launch token"}), 401

    @app.after_request
    def add_security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        response.headers.setdefault("X-XSS-Protection", "1; mode=block")
        response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "img-src 'self' data:; font-src 'self' https://fonts.gstatic.com data:; connect-src 'self'; form-action 'self'",
        )
        return response

    app.register_blueprint(routes.bp)
    return app


def start_flask(port: int = FLASK_PORT):
    app = create_app()
    write_runtime_handshake(port, FLASK_HOST)
    app.run(host=FLASK_HOST, port=port, debug=False, use_reloader=False)


def ping_flask(url: str = FLASK_PING_URL, thread: threading.Thread | None = None, max_attempts=40, timeout=0.4, retry_delay=0.2):
    """Wait until the local Flask server responds to its readiness endpoint."""
    import requests

    for attempt in range(max_attempts):
        if thread is not None and not thread.is_alive():
            return False

        try:
            response = requests.get(url, timeout=timeout, proxies={"http": None, "https": None})
            if response.status_code == 200 and response.json().get("status") == "ok":
                return True
        except (requests.RequestException, ValueError):
            pass

        if attempt < max_attempts - 1:
            time.sleep(retry_delay)

    return False


if __name__ == "__main__":
    db.init_db()
    config_db.init_config_db()
    context_db.init_context_db()

    # Re-verify port availability immediately prior to thread spawn
    if not is_port_available(FLASK_PORT, FLASK_HOST):
        FLASK_PORT = find_available_port(FLASK_HOST)
        FLASK_PING_URL = f"http://{FLASK_HOST}:{FLASK_PORT}/api/ping"

    flask_thread = threading.Thread(target=start_flask, args=(FLASK_PORT,), daemon=True)
    flask_thread.start()

    if not ping_flask(url=FLASK_PING_URL, thread=flask_thread):
        raise RuntimeError(f"Flask did not become ready at {FLASK_PING_URL}")

    print(f"Agent-D backend running at http://{FLASK_HOST}:{FLASK_PORT}")
    print("Press Ctrl+C to stop.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Shutting down.")
