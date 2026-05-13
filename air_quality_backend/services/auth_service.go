package services

import (
	"database/sql"
	"errors"
	"log"

	"air-quality-api/models"
	"air-quality-api/utils"
	"github.com/google/uuid"
)

type AuthService struct {
	db     *sql.DB
	secret string
}

func NewAuthService(db *sql.DB, secret string) *AuthService {
	return &AuthService{db: db, secret: secret}
}

func (s *AuthService) Register(req models.UserRegisterRequest) (*models.User, error) {
	userID := uuid.New().String()
	hashedPassword, err := utils.HashPassword(req.Password)
	if err != nil {
		log.Println("Error hashing password:", err)
		return nil, errors.New("internal server error")
	}

	query := `INSERT INTO users (user_id, email, password, role, timezone, created_at, updated_at) 
	          VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`

	if _, err := s.db.Exec(query, userID, req.Email, hashedPassword, "user", req.Timezone); err != nil {
		log.Println("Error inserting user:", err)
		return nil, errors.New("email already exists")
	}

	user := &models.User{
		UserID:   userID,
		Email:    req.Email,
		Role:     "user",
		Timezone: req.Timezone,
	}

	return user, nil
}

func (s *AuthService) Login(req models.UserLoginRequest) (*models.User, string, string, error) {
	query := `SELECT user_id, email, password, role, timezone FROM users WHERE email = $1`

	var user models.User
	var hashedPassword string

	if err := s.db.QueryRow(query, req.Email).Scan(&user.UserID, &user.Email, &hashedPassword, &user.Role, &user.Timezone); err != nil {
		return nil, "", "", errors.New("invalid credentials")
	}

	if !utils.VerifyPassword(hashedPassword, req.Password) {
		return nil, "", "", errors.New("invalid credentials")
	}

	// Generate tokens - now includes userId and role in JWT claims
	accessToken, err := utils.GenerateAccessToken(user.UserID, user.Email, user.Role, s.secret)
	if err != nil {
		log.Println("Error generating access token:", err)
		return nil, "", "", errors.New("internal server error")
	}

	refreshToken, err := utils.GenerateRefreshToken(user.UserID, s.secret)
	if err != nil {
		log.Println("Error generating refresh token:", err)
		return nil, "", "", errors.New("internal server error")
	}

	return &user, accessToken, refreshToken, nil
}

func (s *AuthService) RefreshAccessToken(refreshToken string) (string, error) {
	claims, err := utils.ValidateToken(refreshToken, s.secret)
	if err != nil {
		return "", errors.New("invalid refresh token")
	}

	query := `SELECT user_id, email, role FROM users WHERE user_id = $1`
	var user models.User

	if err := s.db.QueryRow(query, claims.UserID).Scan(&user.UserID, &user.Email, &user.Role); err != nil {
		return "", errors.New("user not found")
	}

	// Generate new access token with current user role
	accessToken, err := utils.GenerateAccessToken(user.UserID, user.Email, user.Role, s.secret)
	if err != nil {
		log.Println("Error generating access token:", err)
		return "", errors.New("internal server error")
	}

	return accessToken, nil
}