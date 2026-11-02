package main

import "github.com/ilyaero1911/api-aggregator/internal/devserver"

func main() { devserver.Run("billing-worker", "8082") }
