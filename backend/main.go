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
	// 到着地点の写真: リンクに紐づく。閲覧は公開（「到着地点を確認する」で表示）。登録・削除は管理者専用
	api.GET("/links/:id/arrival-photos", handlers.ListArrivalPhotos)
	api.GET("/links/:id", handlers.GetLink)
	api.GET("/settings", handlers.GetSettings)
	api.POST("/users/register", handlers.RegisterUser)
	api.GET("/map-images/active", handlers.GetActiveMapImage)
	api.GET("/node-detours", handlers.ListNodeDetours)
	api.GET("/categories", handlers.ListCategories)
	api.GET("/destinations", handlers.ListDestinations)
	api.GET("/ar-features/matchset", handlers.ListARFeaturesForMatch)
	api.GET("/ar-objects", handlers.ListARObjects)
	api.GET("/survey", handlers.GetSurvey)
	api.POST("/survey/responses", handlers.SubmitSurveyResponse)
	api.GET("/announcement/active", handlers.GetActiveAnnouncement)
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

		// 到着地点の写真（リンク）: 登録・上書き・削除は管理者のみ
		admin.POST("/arrival-photos", handlers.UploadArrivalPhoto)
		admin.PUT("/arrival-photos/:id", handlers.ReplaceArrivalPhoto)
		admin.DELETE("/arrival-photos/:id", handlers.DeleteArrivalPhoto)

		// 合成用写真（到着写真エディタで重ねる素材）: すべて管理者のみ
		admin.GET("/overlay-images", handlers.ListOverlayImages)
		admin.POST("/overlay-images", handlers.UploadOverlayImage)
		admin.DELETE("/overlay-images/:id", handlers.DeleteOverlayImage)

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

		// 道案内ARデモ用の重ね画像（管理画面からのみ利用）
		admin.GET("/demo-overlays", handlers.ListDemoOverlays)
		admin.POST("/demo-overlays", handlers.UploadDemoOverlay)
		admin.DELETE("/demo-overlays/:id", handlers.DeleteDemoOverlay)

		// お知らせ（POP画像）
		admin.GET("/announcements", handlers.ListAnnouncements)
		admin.POST("/announcements", handlers.CreateAnnouncement)
		admin.PUT("/announcements/:id/activate", handlers.ActivateAnnouncement)
		admin.PUT("/announcements/:id/deactivate", handlers.DeactivateAnnouncement)
		admin.DELETE("/announcements/:id", handlers.DeleteAnnouncement)

		admin.POST("/ar-objects", handlers.CreateARObject)
		admin.PUT("/ar-objects/:id", handlers.UpdateARObject)
		admin.DELETE("/ar-objects/:id", handlers.DeleteARObject)

		admin.POST("/categories", handlers.CreateCategory)
		admin.PUT("/categories/:id", handlers.UpdateCategory)
		admin.DELETE("/categories/:id", handlers.DeleteCategory)

		admin.POST("/destinations", handlers.CreateDestination)
		admin.PUT("/destinations/:id", handlers.UpdateDestination)
		admin.DELETE("/destinations/:id", handlers.DeleteDestination)

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
