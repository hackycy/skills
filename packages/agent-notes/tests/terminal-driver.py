"""Exercise the CLI with TTY stdin/stderr and a separately captured stdout."""
import errno
import fcntl
import json
import os
import pty
import select
import subprocess
import struct
import sys
import termios
import time

request = json.load(sys.stdin)
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 24, 100, 0, 0))
environment = {**os.environ, 'CI': '', 'TERM': 'xterm-256color', 'NO_COLOR': '1', **request.get('env', {})}
child = subprocess.Popen(request['argv'], cwd=request['root'], env=environment,
                         stdin=slave, stderr=slave, stdout=subprocess.PIPE, start_new_session=True)
os.close(slave)
output = bytearray()
terminal = bytearray()
pending = bytearray()
actions = list(request.get('actions', []))
deadline = time.monotonic() + 25
streams = [master, child.stdout.fileno()]
try:
    while streams:
        if time.monotonic() > deadline:
            raise TimeoutError('CLI terminal timeout: ' + terminal.decode(errors='replace'))
        for descriptor in select.select(streams, [], [], 0.1)[0]:
            try:
                data = os.read(descriptor, 65536)
            except OSError as error:
                if error.errno != errno.EIO:
                    raise
                data = b''
            if not data:
                streams.remove(descriptor)
                continue
            if descriptor == master:
                terminal.extend(data)
                pending.extend(data)
                if actions and actions[0]['expect'].encode() in pending:
                    action = actions.pop(0)
                    os.write(master, action['send'].encode())
                    pending.clear()
            else:
                output.extend(data)
    status = child.wait(timeout=2)
    if actions:
        raise RuntimeError('Unreached terminal actions: ' + str(actions) + '\n' + terminal.decode(errors='replace') + '\n' + output.decode(errors='replace'))
    print(json.dumps({'status': status, 'stdout': output.decode(), 'stderr': terminal.decode(errors='replace')}))
finally:
    if child.poll() is None:
        child.kill()
        child.wait()
    os.close(master)
