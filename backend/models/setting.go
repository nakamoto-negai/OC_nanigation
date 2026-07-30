package models

type Setting struct {
	ID                  uint    `json:"id" gorm:"primaryKey"`
	MapNorthOffset      float64 `json:"map_north_offset" gorm:"default:0"`
	RerouteVisibility   bool    `json:"reroute_visibility" gorm:"not null;default:true"`
	RerouteIncident     bool    `json:"reroute_incident" gorm:"not null;default:true"`
	ReroteCongestion    bool    `json:"reroute_congestion" gorm:"not null;default:true"`
	RerouteOther        bool    `json:"reroute_other" gorm:"not null;default:true"`
	StampURL            string  `json:"stamp_url" gorm:"default:''"`
	// ヘッダーの食堂混雑度表示・AR ボタンの表示ON/OFF（食堂の値は Cafeteria モデルへ移動）
	ShowCafeteriaCongestion bool `json:"show_cafeteria_congestion" gorm:"not null;default:true"`
	ShowARButton            bool `json:"show_ar_button" gorm:"not null;default:true"`
	// 到着カードに表示するアンケートのリンク先（空なら非表示）
	SurveyURL string `json:"survey_url" gorm:"default:''"`
	// ホーム画面で最初から選択しておく目的地（DestinationID）。未設定(nil)なら選択なし。
	DefaultDestinationID *uint `json:"default_destination_id"`
	// is_selectable ノード → 目的地 への一度きりのデータ移行が完了したか。
	DestinationsMigrated bool `json:"destinations_migrated" gorm:"not null;default:false"`
	// 旧 settings.cafeteria_congestion（単一値）→ Cafeteria（複数）への一度きりの移行が完了したか。
	CafeteriasMigrated bool `json:"cafeterias_migrated" gorm:"not null;default:false"`
}
