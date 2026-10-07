"""Bounded process execution, streaming logs, and process-tree termination."""

from __future__ import annotations

import contextlib
import ctypes
import os
import signal
import subprocess
import time
from pathlib import Path
from typing import Callable

from .common import GoalError


class WindowsJob:
    """A kill-on-close job owns the suspended child before any code executes."""

    def __init__(self):
        from ctypes import wintypes as w
        class BASIC(ctypes.Structure):
            _fields_ = [("process_time", ctypes.c_int64), ("job_time", ctypes.c_int64), ("flags", w.DWORD),
                        ("min_working", ctypes.c_size_t), ("max_working", ctypes.c_size_t), ("active_limit", w.DWORD),
                        ("affinity", ctypes.c_size_t), ("priority", w.DWORD), ("scheduling", w.DWORD)]
        class IO(ctypes.Structure):
            _fields_ = [(name, ctypes.c_uint64) for name in ("read_ops", "write_ops", "other_ops", "read_bytes", "write_bytes", "other_bytes")]
        class EXTENDED(ctypes.Structure):
            _fields_ = [("basic", BASIC), ("io", IO), ("process_memory", ctypes.c_size_t), ("job_memory", ctypes.c_size_t),
                        ("peak_process", ctypes.c_size_t), ("peak_job", ctypes.c_size_t)]
        self.kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        self.kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, w.LPCWSTR]
        self.kernel.CreateJobObjectW.restype = w.HANDLE
        self.kernel.SetInformationJobObject.argtypes = [w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD]
        self.kernel.AssignProcessToJobObject.argtypes = [w.HANDLE, w.HANDLE]
        self.kernel.TerminateJobObject.argtypes = [w.HANDLE, w.UINT]
        self.kernel.CloseHandle.argtypes = [w.HANDLE]
        self.handle = self.kernel.CreateJobObjectW(None, None)
        if not self.handle:
            raise ctypes.WinError(ctypes.get_last_error())
        limits = EXTENDED()
        limits.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if not self.kernel.SetInformationJobObject(self.handle, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
            self.close()
            raise ctypes.WinError(ctypes.get_last_error())

    def attach_and_resume(self, process: subprocess.Popen) -> None:
        if not self.kernel.AssignProcessToJobObject(self.handle, int(process._handle)):
            raise ctypes.WinError(ctypes.get_last_error())
        resume = ctypes.WinDLL("ntdll").NtResumeProcess
        resume.argtypes = [ctypes.c_void_p]
        resume.restype = ctypes.c_long
        if resume(int(process._handle)) != 0:
            raise GoalError("cannot resume Repository process")

    def terminate(self):
        if self.handle:
            self.kernel.TerminateJobObject(self.handle, 1)

    def close(self):
        if self.handle:
            self.kernel.CloseHandle(self.handle)
            self.handle = None


def execute(argv: list[str], cwd: Path, timeout: float, stdout: Path, stderr: Path,
            cancelled: Callable[[], bool], lifecycle_handle) -> tuple[int | None, str | None]:
    process = None
    job = WindowsJob() if os.name == "nt" else None
    termination = None
    try:
        with stdout.open("wb") as out, stderr.open("wb") as err:
            if cancelled():
                return None, "interrupted"
            kwargs = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP | 0x4} if os.name == "nt" else {
                "start_new_session": True, "pass_fds": (lifecycle_handle.fileno(),)}
            try:
                process = subprocess.Popen(argv, cwd=cwd, stdin=subprocess.DEVNULL, stdout=out, stderr=err, shell=False, **kwargs)
                if job:
                    job.attach_and_resume(process)
            except (OSError, GoalError) as exc:
                err.write(f"Cannot execute Repository check: {exc}\n".encode("utf-8"))
                return None, "interrupted"
            deadline = time.monotonic() + timeout
            while process.poll() is None:
                if cancelled():
                    termination = "interrupted"
                    break
                if time.monotonic() >= deadline:
                    termination = "timed-out"
                    break
                time.sleep(0.05)
            if termination:
                if job:
                    job.terminate()
                else:
                    with contextlib.suppress(ProcessLookupError):
                        os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=10)
            return process.returncode, termination
    except KeyboardInterrupt:
        return None, "interrupted"
    finally:
        # A check may not leave child processes behind, even when its main process exits.
        if job:
            job.close()
        elif process:
            with contextlib.suppress(ProcessLookupError):
                os.killpg(process.pid, signal.SIGKILL)
        if process:
            if process.poll() is None:
                process.kill()
            process.wait(timeout=10)
