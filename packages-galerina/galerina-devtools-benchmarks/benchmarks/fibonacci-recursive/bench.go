// Go lane (RD-0442) — fibonacci-recursive. Matches node.mjs exactly: fib(30), 100 iters, result=832040
// (the cross-language checksum oracle — all runtimes must agree). Run via `go run bench.go` (probed skip-if-absent).
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"strconv"
	"time"
)

func fib(n int) int {
	if n <= 1 {
		return n
	}
	return fib(n-1) + fib(n-2)
}

func intFlag(name string, fallback int) int {
	for i, a := range os.Args {
		if a == name && i+1 < len(os.Args) {
			if v, err := strconv.Atoi(os.Args[i+1]); err == nil {
				return v
			}
		}
	}
	return fallback
}

func round(f float64, places int) float64 {
	p := 1.0
	for i := 0; i < places; i++ {
		p *= 10
	}
	return float64(int64(f*p+0.5)) / p
}

func main() {
	n := intFlag("--n", 30)
	its := intFlag("--operations", intFlag("--iterations", 100))

	fib(n) // warmup

	t0 := time.Now()
	result := 0
	for i := 0; i < its; i++ {
		result = fib(n)
	}
	elapsedMs := float64(time.Since(t0).Nanoseconds()) / 1e6

	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)

	out := map[string]any{
		"runtime":             "go",
		"benchmark":           "fibonacci-recursive-v1",
		"n":                   n,
		"result":              result,
		"iterations":          its,
		"elapsedMs":           round(elapsedMs, 3),
		"iterationsPerSecond": round(float64(its)/(elapsedMs/1000), 2),
		"cpu":                 map[string]any{"totalMs": round(elapsedMs, 3)},
		"memory":             map[string]any{"rssBytes": nil, "heapUsedBytes": ms.HeapAlloc, "maxRssBytes": nil},
		"process":            map[string]any{"pid": os.Getpid(), "go": runtime.Version(), "platform": runtime.GOOS, "arch": runtime.GOARCH},
	}
	b, _ := json.Marshal(out)
	fmt.Println(string(b))
}
