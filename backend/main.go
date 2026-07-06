package main

import (
	"log"
	"net/http"
	"os"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/oc-navigation/backend/database"
	"github.com/oc-navigation/backend/handlers"
	"github.com/oc-navigation/backend/middleware"
	"github.com/oc-navigation/backend/ws"
)

func main() {
	if err := database.Connect(); err != nil {
		log.Fatal(err)
	}

	go ws.GlobalHub.Run()

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

	// 公開エンドポイント（ユーザーアプリ・認証）
	api.POST("/admin/login", handlers.AdminLogin)
	api.GET("/nodes", handlers.ListNodes)
	api.GET("/nodes/:id", handlers.GetNode)
	api.GET("/links", handlers.ListLinks)
	api.GET("/links/:id", handlers.GetLink)
	api.GET("/settings", handlers.GetSettings)
	api.POST("/users/register", handlers.RegisterUser)
	api.GET("/map-images/active", handlers.GetActiveMapImage)
	api.GET("/node-detours", handlers.ListNodeDetours)
	api.GET("/categories", handlers.ListCategories)
	api.GET("/ar-features/matchset", handlers.ListARFeaturesForMatch)
	api.GET("/ar-objects", handlers.ListARObjects)
	api.GET("/survey", handlers.GetSurvey)
	api.POST("/survey/responses", handlers.SubmitSurveyResponse)
	api.GET("/events", handlers.ListEvents)

	// 管理者専用エンドポイント（トークン必須）
	admin := api.Group("/").Use(middleware.AdminAuth())
	{
		admin.POST("/nodes", handlers.CreateNode)
		admin.PUT("/nodes/:id", handlers.UpdateNode)
		admin.DELETE("/nodes/:id", handlers.DeleteNode)

		admin.POST("/links", handlers.CreateLink)
		admin.PUT("/links/:id", handlers.UpdateLink)
		admin.DELETE("/links/:id", handlers.DeleteLink)

		admin.POST("/photos", handlers.UploadPhoto)
		admin.DELETE("/photos/:id", handlers.DeletePhoto)
		admin.PUT("/photos/reorder", handlers.ReorderPhotos)

		admin.PUT("/settings", handlers.UpdateSettings)

		admin.GET("/users", handlers.ListUsers)
		admin.GET("/logs", handlers.ListLogs)

		admin.GET("/map-images", handlers.ListMapImages)
		admin.POST("/map-images", handlers.UploadMapImage)
		admin.PUT("/map-images/:id/activate", handlers.ActivateMapImage)
		admin.DELETE("/map-images/:id", handlers.DeleteMapImage)

		admin.POST("/node-detours", handlers.CreateNodeDetour)
		admin.PUT("/node-detours/:id", handlers.UpdateNodeDetour)
		admin.DELETE("/node-detours/:id", handlers.DeleteNodeDetour)

		admin.GET("/ar-features", handlers.ListARFeatures)
		admin.POST("/ar-features", handlers.CreateARFeature)
		admin.DELETE("/ar-features/:id", handlers.DeleteARFeature)

		admin.POST("/ar-objects", handlers.CreateARObject)
		admin.PUT("/ar-objects/:id", handlers.UpdateARObject)
		admin.DELETE("/ar-objects/:id", handlers.DeleteARObject)

		admin.POST("/categories", handlers.CreateCategory)
		admin.PUT("/categories/:id", handlers.UpdateCategory)
		admin.DELETE("/categories/:id", handlers.DeleteCategory)

		admin.POST("/events", handlers.CreateEvent)
		admin.PUT("/events/:id", handlers.UpdateEvent)
		admin.DELETE("/events/:id", handlers.DeleteEvent)

		admin.GET("/survey/questions", handlers.ListSurveyQuestions)
		admin.POST("/survey/questions", handlers.CreateSurveyQuestion)
		admin.PUT("/survey/questions/:id", handlers.UpdateSurveyQuestion)
		admin.DELETE("/survey/questions/:id", handlers.DeleteSurveyQuestion)
		admin.GET("/survey/responses", handlers.ListSurveyResponses)
	}

	r.GET("/ws/user", handlers.UserWS)
	r.GET("/ws/admin", handlers.AdminWS)

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	r.Run(":8080")
}
