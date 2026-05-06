package main

import (
	"log"
	"net/http"
	"os"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/oc-navigation/backend/database"
	"github.com/oc-navigation/backend/handlers"
)

func main() {
	if err := database.Connect(); err != nil {
		log.Fatal(err)
	}

	r := gin.Default()
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"*"},
		AllowCredentials: true,
	}))

	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "./uploads"
	}
	r.Static("/uploads", uploadDir)

	api := r.Group("/api")
	{
		api.GET("/nodes", handlers.ListNodes)
		api.GET("/nodes/:id", handlers.GetNode)
		api.POST("/nodes", handlers.CreateNode)
		api.PUT("/nodes/:id", handlers.UpdateNode)
		api.DELETE("/nodes/:id", handlers.DeleteNode)

		api.GET("/links", handlers.ListLinks)
		api.GET("/links/:id", handlers.GetLink)
		api.POST("/links", handlers.CreateLink)
		api.PUT("/links/:id", handlers.UpdateLink)
		api.DELETE("/links/:id", handlers.DeleteLink)

		api.POST("/photos", handlers.UploadPhoto)
		api.DELETE("/photos/:id", handlers.DeletePhoto)
		api.PUT("/photos/reorder", handlers.ReorderPhotos)

		api.POST("/route", handlers.CalcRoute)
	}

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	r.Run(":8080")
}
