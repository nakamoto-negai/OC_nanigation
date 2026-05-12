package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

func computeAdminToken(password string) string {
	secret := os.Getenv("ADMIN_SECRET")
	if secret == "" {
		secret = "default-secret-change-in-production"
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(password))
	return hex.EncodeToString(mac.Sum(nil))
}

func AdminLogin(c *gin.Context) {
	var body struct {
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "パスワードを入力してください"})
		return
	}
	expected := os.Getenv("ADMIN_PASSWORD")
	if expected == "" {
		expected = "admin"
	}
	if body.Password != expected {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "パスワードが違います"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": computeAdminToken(body.Password)})
}
