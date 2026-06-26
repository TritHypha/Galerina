// arithmetic-threshold — C++ native
// Compile: g++ -O2 -o bench-arithmetic bench.cpp
#include <cstdint>
#include <chrono>
#include <iostream>
#include <cstring>
#include <cstdlib>

int main(int argc, char* argv[]) {
    long long threshold = 200000000000000LL;
    for (int i=1;i<argc-1;++i)
        if (!std::strcmp(argv[i],"--threshold")) threshold=std::atoll(argv[i+1]);
    using clk = std::chrono::steady_clock;
    auto t0=clk::now();
    long long total=0,idx=0,additions=0; uint32_t checksum=0u;
    while (total<=threshold) {
        total+=idx; idx++; additions++;
        total+=idx; idx++; additions++;
        uint32_t ui=(uint32_t)(idx&0xFFFFFFFFLL);
        checksum=(checksum^ui)*2654435761u+ui;
    }
    double elapsed=std::chrono::duration<double,std::milli>(clk::now()-t0).count();
    std::cout<<"{"
        <<"\"runtime\":\"cpp\","
        <<"\"benchmark\":\"arithmetic-threshold-v2\","
        <<"\"threshold\":"<<threshold<<","
        <<"\"additions\":"<<additions<<","
        <<"\"checksum\":"<<checksum<<","
        <<"\"elapsedMs\":"<<elapsed<<","
        <<"\"additionsPerSecond\":"<<(additions/(elapsed/1000.0))
        <<"}"<<std::endl;
}
