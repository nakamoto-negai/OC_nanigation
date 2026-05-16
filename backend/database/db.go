package database

import (
	"fmt"
	"os"

	"github.com/oc-navigation/backend/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

func Connect() error {
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable TimeZone=Asia/Tokyo",
		getEnv("DB_HOST", "localhost"),
		getEnv("DB_PORT", "5432"),
		getEnv("DB_USER", "nav"),
		getEnv("DB_PASSWORD", "nav_pass"),
		getEnv("DB_NAME", "navigation"),
	)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	if err := db.AutoMigrate(&models.Node{}, &models.Link{}, &models.Photo{}, &models.Setting{}, &models.MapImage{}, &models.User{}, &models.UserLog{}, &models.NodeDetour{}); err != nil {
		return fmt.Errorf("failed to migrate: %w", err)
	}

	DB = db
	return nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
