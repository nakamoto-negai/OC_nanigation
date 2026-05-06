package models

import "time"

type Node struct {
	ID          uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	Name        string    `json:"name" gorm:"not null"`
	Description string    `json:"description"`
	X           float64   `json:"x" gorm:"not null"`
	Y           float64   `json:"y" gorm:"not null"`
	Lat         *float64  `json:"lat"`
	Lng         *float64  `json:"lng"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
