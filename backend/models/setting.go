package models

type Setting struct {
	ID                  uint    `json:"id" gorm:"primaryKey"`
	MapNorthOffset      float64 `json:"map_north_offset" gorm:"default:0"`
	RerouteVisibility   bool    `json:"reroute_visibility" gorm:"not null;default:true"`
	RerouteIncident     bool    `json:"reroute_incident" gorm:"not null;default:true"`
	ReroteCongestion    bool    `json:"reroute_congestion" gorm:"not null;default:true"`
	RerouteOther        bool    `json:"reroute_other" gorm:"not null;default:true"`
}
