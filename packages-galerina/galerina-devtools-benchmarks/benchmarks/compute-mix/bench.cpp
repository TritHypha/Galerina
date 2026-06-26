// compute-mix throughput — C++ native (-O2)
// Compile: g++ -O2 -march=native -o bench-compute-mix bench.cpp -lm
#include <cstdint>
#include <cmath>
#include <chrono>
#include <iostream>
#include <cstring>
#include <cstdlib>

static void run_batch(uint32_t& seed, uint32_t& checksum, int batch_size) {
    for (int i = 0; i < batch_size; ++i) {
        seed = seed * 1664525u + 1013904223u;
        uint32_t mix1 = (seed ^ (seed >> 13u)) * 2246822519u;
        uint32_t mix2 = (mix1 ^ (mix1 >> 17u)) * 3266489917u;
        double fval    = (double)mix2 / 4294967296.0;
        uint32_t intval = (uint32_t)(std::sqrt(fval + 1.0) * 1000000.0);
        uint32_t branch = mix2 & 3u;
        if      (branch == 0u) checksum ^= intval;
        else if (branch == 1u) checksum += mix2;
        else if (branch == 2u) checksum ^= (mix1 << 3u);
        else                   checksum += intval + mix1;
        seed     = seed * 2891336453u + 1442695041u;
        checksum ^= seed;
    }
}

int main(int argc, char* argv[]) {
    int target_ms = 30000, warmup_ms = 3000, batch_size = 50000;
    uint32_t seed0 = 123456789u;
    for (int i = 1; i < argc-1; ++i) {
        if (!std::strcmp(argv[i],"--target-ms"))  target_ms  = std::atoi(argv[i+1]);
        if (!std::strcmp(argv[i],"--warmup-ms"))  warmup_ms  = std::atoi(argv[i+1]);
        if (!std::strcmp(argv[i],"--batch-size")) batch_size = std::atoi(argv[i+1]);
    }
    using clk = std::chrono::steady_clock;
    auto ms = [](auto a, auto b){ return std::chrono::duration<double,std::milli>(b-a).count(); };

    auto wt = clk::now(); uint32_t ws=seed0, wc=0;
    while (ms(wt,clk::now()) < warmup_ms) run_batch(ws,wc,batch_size);

    uint32_t s=seed0, c=0; long long ops=0;
    auto t0 = clk::now();
    while (ms(t0,clk::now()) < target_ms) { run_batch(s,c,batch_size); ops+=batch_size; }
    double elapsed = ms(t0,clk::now());

    std::cout<<"{"
        <<"\"runtime\":\"cpp\","
        <<"\"benchmark\":\"compute-mix-throughput-v2\","
        <<"\"version\":2,"
        <<"\"algorithm\":\"lcg2x-xorshift2x-sqrt-4branch\","
        <<"\"targetMs\":"<<target_ms<<","
        <<"\"elapsedMs\":"<<elapsed<<","
        <<"\"operations\":"<<ops<<","
        <<"\"operationsPerSecond\":"<<(ops/(elapsed/1000.0))<<","
        <<"\"checksum\":"<<c
        <<"}"<<std::endl;
}
