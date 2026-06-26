// six-digit-guess — C++ native
// Compile: g++ -O2 -o bench-guess bench.cpp
#include <cstdint>
#include <chrono>
#include <iostream>
#include <string>
#include <cstring>

static const int CODE_LEN=6;

static void bulls_and_cows(const char* cand, const char* tgt, int& bulls, int& cows) {
    bulls=0; int ca[10]={},ta[10]={};
    for(int i=0;i<CODE_LEN;++i) {
        if(cand[i]==tgt[i]) bulls++;
        else { ca[cand[i]-'0']++; ta[tgt[i]-'0']++; }
    }
    cows=0; for(int d=0;d<10;++d) cows+=std::min(ca[d],ta[d]);
}

int main(int argc,char* argv[]) {
    std::string target="042069"; int max_attempts=2000000;
    for(int i=1;i<argc-1;++i) {
        if(!std::strcmp(argv[i],"--target")) target=argv[i+1];
        if(!std::strcmp(argv[i],"--max"))    max_attempts=std::stoi(argv[i+1]);
    }
    using clk=std::chrono::steady_clock; auto t0=clk::now();
    char code[7]; int attempt=0; bool found=false;
    long long tb=0,tc=0;
    while(attempt<max_attempts) {
        int n=attempt%1000000;
        code[0]='0'+(n/100000)%10; code[1]='0'+(n/10000)%10;
        code[2]='0'+(n/1000)%10;  code[3]='0'+(n/100)%10;
        code[4]='0'+(n/10)%10;    code[5]='0'+n%10; code[6]=0;
        attempt++;
        int b=0,c=0; bulls_and_cows(code,target.c_str(),b,c);
        tb+=b; tc+=c;
        if(b==CODE_LEN){found=true;break;}
    }
    double elapsed=std::chrono::duration<double,std::milli>(clk::now()-t0).count();
    std::cout<<"{"
        <<"\"runtime\":\"cpp\","
        <<"\"benchmark\":\"six-digit-guess-v2\","
        <<"\"found\":"<<(found?"true":"false")<<","
        <<"\"attempts\":"<<attempt<<","
        <<"\"totalBulls\":"<<tb<<","
        <<"\"totalCows\":"<<tc<<","
        <<"\"elapsedMs\":"<<elapsed<<","
        <<"\"attemptsPerSecond\":"<<(attempt/(elapsed/1000.0))
        <<"}"<<std::endl;
}
