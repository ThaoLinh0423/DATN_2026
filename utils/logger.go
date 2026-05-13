package utils

import (
	"log"
	"os"
)

var logger = log.New(os.Stdout, "", log.LstdFlags)

func Log(v ...interface{}) {
	logger.Println(v...)
}