#include <cstdint>
#include <chrono>
#include <iostream>
#include <cstring>
#include <cstdlib>
int main(int argc,char*argv[]){
  int its=200000;
  for(int i=1;i<argc-1;i++)
    if(!strcmp(argv[i],"--operations")||!strcmp(argv[i],"--iterations")) its=atoi(argv[i+1]);
  auto t0=std::chrono::steady_clock::now();
  int64_t sum=0;
  for(int j=0;j<its;j++){int64_t x=j,y=j*2,z=j+1;sum+=x+z;}
  double ms=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-t0).count();
  std::cout<<"{\"runtime\":\"cpp\",\"benchmark\":\"record-allocation-v1\","
           <<"\"iterations\":" <<its<<","
           <<"\"sum\":" <<sum<<","
           <<"\"elapsedMs\":" <<ms<<","
           <<"\"iterationsPerSecond\":" <<its/(ms/1000)<<"}"<<std::endl;
}
