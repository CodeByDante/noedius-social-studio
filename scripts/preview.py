"""Local static preview, compatible with the managed preview launcher."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--host', default='127.0.0.1')
parser.add_argument('--port', type=int, default=3000)
parser.add_argument('--strictPort', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
handler = partial(SimpleHTTPRequestHandler, directory=str(root))
print(f'Local: http://{args.host}:{args.port}', flush=True)
ThreadingHTTPServer((args.host, args.port), handler).serve_forever()
