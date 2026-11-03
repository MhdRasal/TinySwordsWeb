#!/usr/bin/env python3
import http.server
import socketserver
import os
import sys

PORT = 8060
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class GodotHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Critical headers required by Godot 4 Web exports for WebAssembly & threads/audio worklets
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    # Allow socket address reuse so restarting doesn't hit TIME_WAIT errors
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", port), GodotHTTPRequestHandler) as httpd:
        print(f"\n=======================================================")
        print(f"  Tiny Swords Web Server is RUNNING!")
        print(f"  Play URL: http://localhost:{port}/TinySwords.html")
        print(f"=======================================================\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
