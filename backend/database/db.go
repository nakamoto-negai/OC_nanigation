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

	if err := db.AutoMigrate(&models.SuperCategory{}, &models.Category{}, &models.Node{}, &models.Destination{}, &models.Link{}, &models.Photo{}, &models.ArrivalPhoto{}, &models.Setting{}, &models.MapImage{}, &models.User{}, &models.UserLog{}, &models.NodeDetour{}, &models.ARObject{}, &models.ARFeature{}, &models.SurveyQuestion{}, &models.SurveyResponse{}, &models.SurveyAnswer{}, &models.Event{}, &models.DemoOverlay{}, &models.Announcement{}, &models.OverlayImage{}, &models.Cafeteria{}, &models.IndoorTransition{}); err != nil {
		return fmt.Errorf("failed to migrate: %w", err)
	}

	if err := migrateToDestinations(db); err != nil {
		return fmt.Errorf("failed to migrate destinations: %w", err)
	}

	if err := migrateCafeterias(db); err != nil {
		return fmt.Errorf("failed to migrate cafeterias: %w", err)
	}

	DB = db
	return nil
}

// migrateCafeterias は旧 settings.cafeteria_congestion（単一値）を Cafeteria（複数）へ
// 一度だけ移行する。旧値を持つ既存DBでは「食堂」1件を作ってヘッダー表示を維持し、
// 旧カラムを削除する。Setting.CafeteriasMigrated で冪等化。
func migrateCafeterias(db *gorm.DB) error {
	var setting models.Setting
	if err := db.FirstOrCreate(&setting, models.Setting{ID: 1}).Error; err != nil {
		return err
	}
	if setting.CafeteriasMigrated {
		return nil
	}

	// 旧カラムがある既存DBのみ、その値で「食堂」を1件シードする。
	if db.Migrator().HasColumn(&models.Setting{}, "cafeteria_congestion") {
		var row struct{ CafeteriaCongestion int }
		if err := db.Table("settings").
			Select("cafeteria_congestion").
			Where("id = ?", 1).
			Scan(&row).Error; err == nil {
			if err := db.Create(&models.Cafeteria{Name: "食堂", CongestionLevel: row.CafeteriaCongestion}).Error; err != nil {
				return err
			}
		}
		if err := db.Migrator().DropColumn(&models.Setting{}, "cafeteria_congestion"); err != nil {
			return err
		}
	}

	setting.CafeteriasMigrated = true
	return db.Save(&setting).Error
}

// migrateToDestinations は、旧スキーマ（Node.is_selectable / Event.node_id /
// Setting.default_dest_node_id）を新しい Destination モデルへ一度だけ移行する。
// Setting.DestinationsMigrated フラグで二重実行を防ぐため冪等。
func migrateToDestinations(db *gorm.DB) error {
	var setting models.Setting
	if err := db.FirstOrCreate(&setting, models.Setting{ID: 1}).Error; err != nil {
		return err
	}
	if setting.DestinationsMigrated {
		return nil
	}

	// 新規DB（is_selectable 列が存在しない＝旧データが無い）なら移行対象なし。
	// フラグだけ立てて以後スキップする。
	if !db.Migrator().HasColumn(&models.Node{}, "is_selectable") {
		setting.DestinationsMigrated = true
		return db.Save(&setting).Error
	}

	return db.Transaction(func(tx *gorm.DB) error {
		// 旧カラム（is_selectable, category_id）は AutoMigrate では消えず残っているので生で読む。
		type oldNode struct {
			ID           uint
			Name         string
			CategoryID   *uint
			IsSelectable bool
		}
		var oldNodes []oldNode
		if err := tx.Table("nodes").
			Select("id", "name", "category_id", "is_selectable").
			Where("is_selectable = ?", true).
			Find(&oldNodes).Error; err != nil {
			return err
		}

		// 旧デフォルト目的地（ノードID）を読む。列が無い場合もあるのでエラーは無視して nil 扱い。
		var oldDefaultNodeID *uint
		var settingRow struct{ DefaultDestNodeID *uint }
		if err := tx.Table("settings").
			Select("default_dest_node_id").
			Where("id = ?", 1).
			Scan(&settingRow).Error; err == nil {
			oldDefaultNodeID = settingRow.DefaultDestNodeID
		}

		for _, n := range oldNodes {
			dest := models.Destination{Name: n.Name, CategoryID: n.CategoryID}
			if err := tx.Create(&dest).Error; err != nil {
				return err
			}
			// 多対多の所属（destination_nodes）を1行張る。
			if err := tx.Exec(
				"INSERT INTO destination_nodes (destination_id, node_id) VALUES (?, ?)",
				dest.ID, n.ID,
			).Error; err != nil {
				return err
			}
			// このノードのイベントを、作成した目的地へ移す。
			if err := tx.Model(&models.Event{}).
				Where("node_id = ?", n.ID).
				Update("destination_id", dest.ID).Error; err != nil {
				return err
			}
			// 旧デフォルト目的地ノードなら、対応する目的地IDを新設定に反映。
			if oldDefaultNodeID != nil && *oldDefaultNodeID == n.ID {
				id := dest.ID
				setting.DefaultDestinationID = &id
			}
		}

		// 旧カラムを削除する。列を落とすと、その列に張られた旧FK制約
		// （events.node_id→nodes.id / nodes.category_id→categories.id）も一緒に消えるため、
		// これを残すとノード削除・カテゴリ削除が旧FKでブロックされてしまう。データは
		// 上でコピー済みなので安全。Postgres はトランザクション内DDLを許可する。
		for _, col := range []struct {
			model interface{}
			name  string
		}{
			{&models.Event{}, "node_id"},
			{&models.Node{}, "is_selectable"},
			{&models.Node{}, "category_id"},
			{&models.Setting{}, "default_dest_node_id"},
		} {
			if tx.Migrator().HasColumn(col.model, col.name) {
				if err := tx.Migrator().DropColumn(col.model, col.name); err != nil {
					return err
				}
			}
		}

		setting.DestinationsMigrated = true
		return tx.Save(&setting).Error
	})
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
