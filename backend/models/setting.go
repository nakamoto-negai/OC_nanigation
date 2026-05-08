package models

type Setting struct {
	ID             uint    `json:"id" gorm:"primaryKey"`
	MapNorthOffset float64 `json:"map_north_offset" gorm:"default:0"`
}
