package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/oc-navigation/backend/middleware"
)

// AdminLogin はパスワードからロールを判定し、トークンとロールを返す。
//   ADMIN_PASSWORD     に一致 → role="admin"（全機能）
//   CAFETERIA_PASSWORD に一致 → role="cafeteria"（食堂の混雑度のみ）
func AdminLogin(c *gin.Context) {
	var body struct {
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "パスワードを入力してください"})
		return
	}

	switch body.Password {
	case middleware.AdminPassword():
		c.JSON(http.StatusOK, gin.H{
			"token": middleware.ComputeToken(body.Password),
			"role":  middleware.RoleAdmin,
		})
	case middleware.CafeteriaPassword():
		c.JSON(http.StatusOK, gin.H{
			"token": middleware.ComputeToken(body.Password),
			"role":  middleware.RoleCafeteria,
		})
	default:
		c.JSON(http.StatusUnauthorized, gin.H{"error": "パスワードが違います"})
	}
}
