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

// ロール定義。
//   admin     … 全機能を編集できる管理者
//   cafeteria … 食堂の混雑度だけを編集できる限定アカウント
const (
	RoleAdmin     = "admin"
	RoleCafeteria = "cafeteria"
)

func secret() string {
	if s := os.Getenv("ADMIN_SECRET"); s != "" {
		return s
	}
	return "default-secret-change-in-production"
}

// AdminPassword は全機能管理者のパスワード（env ADMIN_PASSWORD、既定 "admin"）。
func AdminPassword() string {
	if p := os.Getenv("ADMIN_PASSWORD"); p != "" {
		return p
	}
	return "admin"
}

// CafeteriaPassword は食堂編集用アカウントのパスワード（env CAFETERIA_PASSWORD、既定 "cafeteria"）。
func CafeteriaPassword() string {
	if p := os.Getenv("CAFETERIA_PASSWORD"); p != "" {
		return p
	}
	return "cafeteria"
}

// ComputeToken はパスワードから認証トークン（HMAC-SHA256）を作る。
func ComputeToken(password string) string {
	mac := hmac.New(sha256.New, []byte(secret()))
	mac.Write([]byte(password))
	return hex.EncodeToString(mac.Sum(nil))
}

func tokenFromHeader(c *gin.Context) string {
	token := c.GetHeader("X-Admin-Token")
	if token == "" {
		token = strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
	}
	return token
}

func tokenEquals(token, password string) bool {
	if token == "" {
		return false
	}
	return hmac.Equal([]byte(token), []byte(ComputeToken(password)))
}

// AdminAuth は全機能管理者トークンのみを許可する。
func AdminAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !tokenEquals(tokenFromHeader(c), AdminPassword()) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "管理者認証が必要です"})
			c.Abort()
			return
		}
		c.Next()
	}
}

// CafeteriaAuth は食堂編集用トークン、または全機能管理者トークンを許可する。
// （管理者は食堂の混雑度も当然編集できる）
func CafeteriaAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := tokenFromHeader(c)
		if !tokenEquals(token, CafeteriaPassword()) && !tokenEquals(token, AdminPassword()) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "認証が必要です"})
			c.Abort()
			return
		}
		c.Next()
	}
}
