// six-digit-guess — Rust native
// Compile: rustc -O -o bench-guess bench.rs
use std::time::Instant;
use std::env;
use std::convert::TryInto;
const CODE_LEN:usize=6;
fn bulls_and_cows(cand:&[u8;CODE_LEN],tgt:&[u8;CODE_LEN])->(i32,i32) {
    let mut bulls=0i32; let mut ca=[0i32;10]; let mut ta=[0i32;10];
    for i in 0..CODE_LEN {
        if cand[i]==tgt[i]{bulls+=1;}
        else{ca[(cand[i]-b'0')as usize]+=1;ta[(tgt[i]-b'0')as usize]+=1;}
    }
    let cows:i32=(0..10).map(|d|ca[d].min(ta[d])).sum();
    (bulls,cows)
}
fn fmt_code(n:usize)->[u8;CODE_LEN]{
    [b'0'+((n/100000)%10)as u8,b'0'+((n/10000)%10)as u8,
     b'0'+((n/1000)%10)as u8,b'0'+((n/100)%10)as u8,
     b'0'+((n/10)%10)as u8,b'0'+(n%10)as u8]
}
fn main(){
    let args:Vec<String>=env::args().collect();
    let mut ts="042069".to_string(); let mut max=2_000_000usize;
    let mut i=1;
    while i+1<args.len(){match args[i].as_str(){"--target"=>ts=args[i+1].clone(),"--max"=>max=args[i+1].parse().unwrap_or(max),_=>{}};i+=2;}
    let tgt:[u8;CODE_LEN]=ts.as_bytes()[..CODE_LEN].try_into().unwrap();
    let t0=Instant::now(); let mut attempt=0usize; let mut found=false;
    let mut tb=0i64; let mut tc=0i64;
    while attempt<max {
        let code=fmt_code(attempt%1_000_000); attempt+=1;
        let(b,c)=bulls_and_cows(&code,&tgt);tb+=b as i64;tc+=c as i64;
        if b as usize==CODE_LEN{found=true;break;}
    }
    let elapsed=t0.elapsed().as_secs_f64()*1000.0;
    println!("{{\"runtime\":\"rust\",\"benchmark\":\"six-digit-guess-v2\",\"found\":{},\"attempts\":{},\"totalBulls\":{},\"totalCows\":{},\"elapsedMs\":{:.3},\"attemptsPerSecond\":{:.2}}}",
        found,attempt,tb,tc,elapsed,attempt as f64/(elapsed/1000.0));
}
