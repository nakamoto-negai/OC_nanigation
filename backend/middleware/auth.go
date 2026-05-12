package middleware

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

func AdminAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.GetHeader("X-Admin-Token")
		if token == "" {
			auth := c.GetHeader("Authorization")
			token = strings.TrimPrefix(auth, "Bearer ")
		}
		if !isValidAdminToken(token) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "管理者認証が必要です"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func isValidAdminToken(token string) bool {
	if token == "" {
		return false
	}
	password := os.Getenv("ADMIN_PASSWORD")
	if password == "" {
		password = "admin"
	}
	secret := os.Getenv("ADMIN_SECRET")
	if secret == "" {
		secret = "default-secret-change-in-production"
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(password))
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(token), []byte(expected))
}
