package models

import "time"

type Link struct {
	ID            uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	Name          string    `json:"name"`
	Description   string    `json:"description"`
	FromNodeID    uint      `json:"from_node_id" gorm:"not null"`
	ToNodeID      uint      `json:"to_node_id" gorm:"not null"`
	FromNode      *Node     `json:"from_node,omitempty" gorm:"foreignKey:FromNodeID"`
	ToNode        *Node     `json:"to_node,omitempty" gorm:"foreignKey:ToNodeID"`
	Distance      float64   `json:"distance" gorm:"not null;default:1"`
	Bidirectional bool      `json:"bidirectional" gorm:"default:true"`
	Photos        []Photo   `json:"photos" gorm:"foreignKey:LinkID;constraint:OnDelete:CASCADE"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type Photo struct {
	ID        uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	LinkID    uint      `json:"link_id" gorm:"not null"`
	SortOrder int       `json:"sort_order" gorm:"default:0"`
	URL       string    `json:"url" gorm:"not null"`
	Caption   string    `json:"caption"`
	CreatedAt time.Time `json:"created_at"`
}
