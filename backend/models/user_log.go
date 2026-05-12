package models

import "time"

type UserLog struct {
	ID         uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	DeviceID   string    `json:"device_id" gorm:"index;not null"`
	Action     string    `json:"action" gorm:"not null"`
	FromNode   string    `json:"from_node"`
	ToNode     string    `json:"to_node"`
	Step       int       `json:"step"`
	TotalSteps int       `json:"total_steps"`
	CreatedAt  time.Time `json:"created_at"`
}
