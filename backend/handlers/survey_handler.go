package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/oc-navigation/backend/database"
	"github.com/oc-navigation/backend/models"
)

// GetSurvey はユーザーアプリ向けの公開エンドポイント。
// 有効な質問一覧と、その端末が既に回答済みかどうかを返す。
// GET /api/survey?device_id=xxx
func GetSurvey(c *gin.Context) {
	var questions []models.SurveyQuestion
	database.DB.Where("is_active = ?", true).Order("page asc, sort_order asc, id asc").Find(&questions)

	answered := false
	if deviceID := c.Query("device_id"); deviceID != "" {
		var count int64
		database.DB.Model(&models.SurveyResponse{}).Where("device_id = ?", deviceID).Count(&count)
		answered = count > 0
	}

	c.JSON(http.StatusOK, gin.H{"questions": questions, "answered": answered})
}

// SubmitSurveyResponse はユーザーの回答を保存する（公開）。1端末につき1回だけ。
// POST /api/survey/responses
func SubmitSurveyResponse(c *gin.Context) {
	var body struct {
		DeviceID string `json:"device_id" binding:"required"`
		Answers  []struct {
			QuestionID uint   `json:"question_id"`
			Value      int    `json:"value"`
			Text       string `json:"text"`
		} `json:"answers"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 1人1回。既に回答済みなら 409。
	var existing int64
	database.DB.Model(&models.SurveyResponse{}).Where("device_id = ?", body.DeviceID).Count(&existing)
	if existing > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "already answered"})
		return
	}

	// 有効な質問を読み込み、回答の検証に使う。
	var questions []models.SurveyQuestion
	database.DB.Where("is_active = ?", true).Find(&questions)
	qByID := make(map[uint]models.SurveyQuestion, len(questions))
	for _, q := range questions {
		qByID[q.ID] = q
	}

	// 送信された回答を質問IDで引けるようにする。
	type incoming struct {
		Value int
		Text  string
		given bool
	}
	ansByQ := make(map[uint]incoming, len(body.Answers))
	for _, a := range body.Answers {
		ansByQ[a.QuestionID] = incoming{Value: a.Value, Text: strings.TrimSpace(a.Text), given: true}
	}

	// 検証しつつ保存用の回答を組み立てる。
	answers := make([]models.SurveyAnswer, 0, len(questions))
	for _, q := range questions {
		a := ansByQ[q.ID]
		hasAnswer := false
		if q.Type == "likert" {
			hasAnswer = a.given && a.Value >= 1 && a.Value <= q.ScaleMax
		} else { // text
			hasAnswer = a.given && a.Text != ""
		}

		if q.Required && !hasAnswer {
			c.JSON(http.StatusBadRequest, gin.H{"error": "必須の質問が未回答です: " + q.Text})
			return
		}
		if !hasAnswer {
			continue // 任意で未回答の質問は記録しない
		}

		ans := models.SurveyAnswer{
			QuestionID:   q.ID,
			QuestionText: q.Text,
			QuestionType: q.Type,
		}
		if q.Type == "likert" {
			ans.Value = a.Value
		} else {
			ans.Text = a.Text
		}
		answers = append(answers, ans)
	}

	resp := models.SurveyResponse{
		DeviceID:  body.DeviceID,
		CreatedAt: time.Now(),
		Answers:   answers,
	}
	if err := database.DB.Create(&resp).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	go database.DB.Create(&models.UserLog{
		DeviceID:  body.DeviceID,
		Action:    "survey_submit",
		CreatedAt: time.Now(),
	})

	c.JSON(http.StatusCreated, resp)
}

// ── 管理者用 ──────────────────────────────────────────────────────────────────

// ListSurveyQuestions は無効な質問も含めた全質問を返す（管理者）。
func ListSurveyQuestions(c *gin.Context) {
	var questions []models.SurveyQuestion
	database.DB.Order("page asc, sort_order asc, id asc").Find(&questions)
	c.JSON(http.StatusOK, questions)
}

func CreateSurveyQuestion(c *gin.Context) {
	var q models.SurveyQuestion
	if err := c.ShouldBindJSON(&q); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	normalizeQuestion(&q)
	if err := database.DB.Create(&q).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, q)
}

func UpdateSurveyQuestion(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var q models.SurveyQuestion
	if err := database.DB.First(&q, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "question not found"})
		return
	}
	if err := c.ShouldBindJSON(&q); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	normalizeQuestion(&q)
	database.DB.Save(&q)
	c.JSON(http.StatusOK, q)
}

func DeleteSurveyQuestion(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	// 質問を消しても既存回答は質問文スナップショットを保持しているため意味は残る。
	database.DB.Delete(&models.SurveyQuestion{}, id)
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

// ListSurveyResponses は全回答を回答明細つきで新しい順に返す（管理者）。
func ListSurveyResponses(c *gin.Context) {
	var responses []models.SurveyResponse
	database.DB.Preload("Answers").Order("created_at desc").Find(&responses)
	c.JSON(http.StatusOK, responses)
}

// normalizeQuestion は不正な値を整える。
func normalizeQuestion(q *models.SurveyQuestion) {
	if q.Type != "text" {
		q.Type = "likert"
	}
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Type == "likert" {
		if q.ScaleMax < 2 {
			q.ScaleMax = 5
		}
		if q.ScaleMax > 10 {
			q.ScaleMax = 10
		}
	}
}
