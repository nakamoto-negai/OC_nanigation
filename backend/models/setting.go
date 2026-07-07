package models

type Setting struct {
	ID                  uint    `json:"id" gorm:"primaryKey"`
	MapNorthOffset      float64 `json:"map_north_offset" gorm:"default:0"`
	RerouteVisibility   bool    `json:"reroute_visibility" gorm:"not null;default:true"`
	RerouteIncident     bool    `json:"reroute_incident" gorm:"not null;default:true"`
	ReroteCongestion    bool    `json:"reroute_congestion" gorm:"not null;default:true"`
	RerouteOther        bool    `json:"reroute_other" gorm:"not null;default:true"`
	StampURL            string  `json:"stamp_url" gorm:"default:''"`
	CafeteriaCongestion int     `json:"cafeteria_congestion" gorm:"not null;default:0"`
	// ヘッダーの食堂混雑度表示・AR ボタンの表示ON/OFF
	ShowCafeteriaCongestion bool `json:"show_cafeteria_congestion" gorm:"not null;default:true"`
	ShowARButton            bool `json:"show_ar_button" gorm:"not null;default:true"`
	// 到着カードに表示するアンケートのリンク先（空なら非表示）
	SurveyURL string `json:"survey_url" gorm:"default:''"`
}
