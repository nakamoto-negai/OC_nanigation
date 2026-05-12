package models

import "time"

type User struct {
	ID        uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	DeviceID  string    `json:"device_id" gorm:"uniqueIndex;not null"`
	CreatedAt time.Time `json:"created_at"`
}
