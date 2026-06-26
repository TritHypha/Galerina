#include <cstdint>
#include <chrono>
#include <iostream>
#include <cstring>
#include <cstdlib>
#include <vector>
#include <numeric>

int64_t pipeline(const std::vector<int>& arr) {
    int64_t sum = 0;
    for (int x : arr) {
        if (x % 2 == 0) sum += (int64_t)x * 2;
    }
    return sum;
}

int main(int argc, char* argv[]) {
    int size = 10000;
    int its = 100000;
    for (int i = 1; i < argc - 1; i++) {
        if (!strcmp(argv[i], "--size")) size = atoi(argv[i+1]);
        if (!strcmp(argv[i], "--operations") || !strcmp(argv[i], "--iterations")) its = atoi(argv[i+1]);
    }
    std::vector<int> arr(size);
    std::iota(arr.begin(), arr.end(), 0);
    // Warmup
    pipeline(arr);
    auto t0 = std::chrono::steady_clock::now();
    int64_t result = 0;
    for (int i = 0; i < its; i++) { result = pipeline(arr); }
    double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
    std::cout << "{\"runtime\":\"cpp\",\"benchmark\":\"collection-pipeline-v1\","
              << "\"size\":" << size << ","
              << "\"iterations\":" << its << ","
              << "\"result\":" << result << ","
              << "\"elapsedMs\":" << ms << ","
              << "\"iterationsPerSecond\":" << its / (ms / 1000) << "}" << std::endl;
}
