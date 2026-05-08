package models

import "time"

type MapImage struct {
	ID        uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	Name      string    `json:"name"`
	URL       string    `json:"url" gorm:"not null"`
	Width     int       `json:"width" gorm:"default:0"`
	Height    int       `json:"height" gorm:"default:0"`
	IsActive  bool      `json:"is_active" gorm:"default:false"`
	CreatedAt time.Time `json:"created_at"`
}
