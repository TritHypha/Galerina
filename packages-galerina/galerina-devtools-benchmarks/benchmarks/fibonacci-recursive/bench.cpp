#include <cstdint>
#include <chrono>
#include <iostream>
#include <cstring>
#include <cstdlib>

uint64_t fib(uint64_t n) {
    if (n <= 1) return n;
    return fib(n - 1) + fib(n - 2);
}

int main(int argc, char* argv[]) {
    int n = 30;
    int its = 100000;
    for (int i = 1; i < argc - 1; i++) {
        if (!strcmp(argv[i], "--n")) n = atoi(argv[i+1]);
        if (!strcmp(argv[i], "--operations") || !strcmp(argv[i], "--iterations")) its = atoi(argv[i+1]);
    }
    // Warmup
    fib(n);
    auto t0 = std::chrono::steady_clock::now();
    uint64_t result = 0;
    for (int i = 0; i < its; i++) { result = fib(n); }
    double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
    std::cout << "{\"runtime\":\"cpp\",\"benchmark\":\"fibonacci-recursive-v1\","
              << "\"n\":" << n << ","
              << "\"result\":" << result << ","
              << "\"iterations\":" << its << ","
              << "\"elapsedMs\":" << ms << ","
              << "\"callsPerSecond\":" << its / (ms / 1000) << "}" << std::endl;
}
