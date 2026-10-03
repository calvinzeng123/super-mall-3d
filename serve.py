# 开发用静态服务器：禁止缓存；POST /__shot?name=xx 把画布截图保存到 shots/xx.jpg
import http.server, sys, os, base64
from urllib.parse import urlparse, parse_qs

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def log_message(self, *args):
        pass

    def do_POST(self):
        url = urlparse(self.path)
        if url.path != '/__shot':
            self.send_error(404)
            return
        name = ''.join(c for c in parse_qs(url.query).get('name', ['shot'])[0] if c.isalnum() or c in '-_')
        data = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        if data.startswith(b'data:'):
            data = base64.b64decode(data.split(b',', 1)[1])
        os.makedirs('shots', exist_ok=True)
        with open(os.path.join('shots', (name or 'shot') + '.jpg'), 'wb') as f:
            f.write(data)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'ok')

os.chdir(os.path.dirname(os.path.abspath(__file__)))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 5174
http.server.ThreadingHTTPServer(('127.0.0.1', port), NoCache).serve_forever()
