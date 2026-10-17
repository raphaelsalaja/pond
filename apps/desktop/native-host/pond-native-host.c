#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#include <windows.h>
#include <sddl.h>
#else
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#endif

/** Same framing as Chrome native messaging: 32-bit little-endian length, then UTF-8 JSON. */
#define MAX_MSG (8u * 1024u * 1024u)
/** Chrome closes the port when the host sends more than 1 MiB, so cap below it. */
#define MAX_RESPONSE (1024u * 1024u - 4096u)

static const char *offline_json = "{\"ok\":false,\"error\":\"offline\"}";
static const char *too_large_json = "{\"ok\":false,\"error\":\"too_large\"}";

static int read_full(
#ifdef _WIN32
    HANDLE fd,
#else
    int fd,
#endif
    void *buf, size_t n) {
  unsigned char *p = buf;
  size_t got = 0;
  while (got < n) {
#ifdef _WIN32
    DWORD chunk = 0;
    DWORD remaining = (DWORD)(n - got);
    if (!ReadFile(fd, p + got, remaining, &chunk, NULL) || chunk == 0) return -1;
    got += (size_t)chunk;
#else
    ssize_t r = read(fd, p + got, n - got);
    if (r == 0) return -1;
    if (r < 0) {
      if (errno == EINTR) continue;
      return -1;
    }
    got += (size_t)r;
#endif
  }
  return 0;
}

static int write_full(
#ifdef _WIN32
    HANDLE fd,
#else
    int fd,
#endif
    const void *buf, size_t n) {
  const unsigned char *p = buf;
  size_t put = 0;
  while (put < n) {
#ifdef _WIN32
    DWORD chunk = 0;
    DWORD remaining = (DWORD)(n - put);
    if (!WriteFile(fd, p + put, remaining, &chunk, NULL) || chunk == 0) return -1;
    put += (size_t)chunk;
#else
    ssize_t w = write(fd, p + put, n - put);
    if (w < 0) {
      if (errno == EINTR) continue;
      return -1;
    }
    put += (size_t)w;
#endif
  }
  return 0;
}

#ifdef _WIN32
static int current_user_pipe_path(char *pipe_path, size_t capacity) {
  HANDLE token = NULL;
  DWORD size = 0;
  TOKEN_USER *user = NULL;
  LPSTR sid = NULL;
  int result = -1;

  if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) return -1;
  (void)GetTokenInformation(token, TokenUser, NULL, 0, &size);
  if (GetLastError() != ERROR_INSUFFICIENT_BUFFER || size == 0) goto done;
  user = malloc(size);
  if (!user) goto done;
  if (!GetTokenInformation(token, TokenUser, user, size, &size)) goto done;
  if (!ConvertSidToStringSidA(user->User.Sid, &sid)) goto done;

  int n = snprintf(
      pipe_path,
      capacity,
      "\\\\.\\pipe\\pond-native-host-%s",
      sid);
  if (n >= 0 && (size_t)n < capacity) result = 0;

done:
  if (sid) LocalFree(sid);
  free(user);
  if (token) CloseHandle(token);
  return result;
}

static HANDLE connect_to_pond(void) {
  char pipe_path[256];
  if (current_user_pipe_path(pipe_path, sizeof pipe_path) != 0) {
    return INVALID_HANDLE_VALUE;
  }
  for (int attempt = 0; attempt < 2; attempt++) {
    HANDLE pipe = CreateFileA(
        pipe_path,
        GENERIC_READ | GENERIC_WRITE,
        0,
        NULL,
        OPEN_EXISTING,
        0,
        NULL);
    if (pipe != INVALID_HANDLE_VALUE) return pipe;
    if (GetLastError() != ERROR_PIPE_BUSY || !WaitNamedPipeA(pipe_path, 2000)) {
      break;
    }
  }
  return INVALID_HANDLE_VALUE;
}
#endif

static int write_reply(const void *body, uint32_t len) {
  if (fwrite(&len, 4, 1, stdout) != 1) return -1;
  if (fwrite(body, 1, len, stdout) != len) return -1;
  return fflush(stdout) == 0 ? 0 : -1;
}

static void reply_json(const char *json) {
  (void)write_reply(json, (uint32_t)strlen(json));
}

static void reply_offline(void) {
  reply_json(offline_json);
}

/** Discards an oversize request so the browser's write does not fail mid-message. */
static void drain_stdin(uint32_t n) {
  unsigned char scratch[4096];
  while (n > 0) {
    size_t want = n < sizeof scratch ? n : sizeof scratch;
    size_t got = fread(scratch, 1, want, stdin);
    if (got == 0) return;
    n -= (uint32_t)got;
  }
}

int main(void) {
#ifdef _WIN32
  (void)_setmode(_fileno(stdin), _O_BINARY);
  (void)_setmode(_fileno(stdout), _O_BINARY);
#else
  const char *home = getenv("HOME");
  if (!home || !home[0]) {
    fprintf(stderr, "pond-native-host: HOME is unset\n");
    reply_offline();
    return 0;
  }

  char sock_path[512];
  int n = snprintf(
      sock_path,
      sizeof sock_path,
      "%s/Library/Application Support/Pond/native.sock",
      home);
  if (n < 0 || (size_t)n >= sizeof sock_path) {
    reply_offline();
    return 0;
  }
#endif

  uint32_t req_len = 0;
  if (fread(&req_len, 4, 1, stdin) != 1) {
    return 0;
  }
  if (req_len == 0 || req_len > MAX_MSG) {
    fprintf(stderr, "pond-native-host: request too large (%u)\n", req_len);
    reply_json(too_large_json);
    drain_stdin(req_len);
    return 0;
  }

  unsigned char *req = malloc(req_len);
  if (!req) {
    reply_offline();
    return 0;
  }
  if (fread(req, 1, req_len, stdin) != req_len) {
    free(req);
    reply_offline();
    return 0;
  }

#ifdef _WIN32
  HANDLE fd = connect_to_pond();
  if (fd == INVALID_HANDLE_VALUE) {
#else
  int fd = socket(AF_UNIX, SOCK_STREAM, 0);
  if (fd < 0) {
#endif
    free(req);
    reply_offline();
    return 0;
  }

#ifndef _WIN32
  struct sockaddr_un addr;
  memset(&addr, 0, sizeof addr);
  addr.sun_family = AF_UNIX;
  strncpy(addr.sun_path, sock_path, sizeof addr.sun_path - 1);

  if (connect(fd, (struct sockaddr *)&addr, sizeof addr) != 0) {
    close(fd);
    free(req);
    reply_offline();
    return 0;
  }
#endif

  if (write_full(fd, &req_len, 4) != 0 || write_full(fd, req, req_len) != 0) {
#ifdef _WIN32
    CloseHandle(fd);
#else
    close(fd);
#endif
    free(req);
    reply_offline();
    return 0;
  }
  free(req);

  uint32_t res_len = 0;
  if (read_full(fd, &res_len, 4) != 0 || res_len == 0 || res_len > MAX_MSG) {
#ifdef _WIN32
    CloseHandle(fd);
#else
    close(fd);
#endif
    reply_offline();
    return 0;
  }
  if (res_len > MAX_RESPONSE) {
#ifdef _WIN32
    CloseHandle(fd);
#else
    close(fd);
#endif
    reply_json(too_large_json);
    return 0;
  }

  unsigned char *res = malloc(res_len);
  if (!res) {
#ifdef _WIN32
    CloseHandle(fd);
#else
    close(fd);
#endif
    reply_offline();
    return 0;
  }
  if (read_full(fd, res, res_len) != 0) {
    free(res);
#ifdef _WIN32
    CloseHandle(fd);
#else
    close(fd);
#endif
    reply_offline();
    return 0;
  }
#ifdef _WIN32
  CloseHandle(fd);
#else
  close(fd);
#endif

  int written = write_reply(res, res_len);
  free(res);
  if (written != 0) {
    fprintf(stderr, "pond-native-host: failed to write response\n");
    return 1;
  }
  return 0;
}
