package services

import (
	"database/sql"
	"errors"
	"log"
	"strings"
	"time"

	"air-quality-api/models"
	"golang.org/x/crypto/bcrypt"
)

type UserService struct {
	db *sql.DB
}

func NewUserService(db *sql.DB) *UserService {
	return &UserService{db: db}
}

func (s *UserService) GetByID(userID string) (*models.User, error) {
	query := `SELECT user_id, email, COALESCE(name, ''), COALESCE(phone, ''), role, timezone, created_at, updated_at 
	          FROM users WHERE user_id = $1`

	var user models.User

	if err := s.db.QueryRow(query, userID).Scan(
		&user.UserID, &user.Email, &user.Name, &user.Phone, &user.Role, &user.Timezone,
		&user.CreatedAt, &user.UpdatedAt,
	); err != nil {
		if err == sql.ErrNoRows {
			log.Printf("User not found for ID: %s", userID)
			return nil, errors.New("user not found")
		}
		log.Printf("Database scan error: %v", err)
		return nil, err
	}

	log.Printf("User retrieved successfully: %+v", user)
	return &user, nil
}

func (s *UserService) Update(userID string, req *models.UserUpdateRequest) (*models.User, error) {
	query := `UPDATE users SET name = $1, email = $2, phone = $3, updated_at = $4 
	          WHERE user_id = $5 RETURNING user_id, email, COALESCE(name, ''), COALESCE(phone, ''), role, timezone, created_at, updated_at`

	var user models.User

	if err := s.db.QueryRow(query, req.Name, req.Email, req.Phone, time.Now(), userID).Scan(
		&user.UserID, &user.Email, &user.Name, &user.Phone, &user.Role, &user.Timezone,
		&user.CreatedAt, &user.UpdatedAt,
	); err != nil {
		log.Printf("Update user error: %v", err)
		return nil, err
	}

	return &user, nil
}

func (s *UserService) ChangePassword(userID string, currentPassword, newPassword string) error {
	// Get current password hash
	var passwordHash string
	query := `SELECT password FROM users WHERE user_id = $1`

	if err := s.db.QueryRow(query, userID).Scan(&passwordHash); err != nil {
		log.Printf("Error getting password hash: %v", err)
		return err
	}

	// Verify current password
	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(currentPassword)); err != nil {
		log.Printf("Password verification failed for user: %s", userID)
		return errors.New("invalid current password")
	}

	// Hash new password
	newHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("Error hashing new password: %v", err)
		return err
	}

	// Update password
	updateQuery := `UPDATE users SET password = $1, updated_at = $2 WHERE user_id = $3`
	if _, err := s.db.Exec(updateQuery, string(newHash), time.Now(), userID); err != nil {
		log.Printf("Error updating password: %v", err)
		return err
	}

	log.Printf("Password changed successfully for user: %s", userID)
	return nil
}

func (s *UserService) GetSessions(userID string) ([]*models.UserSession, error) {
	query := `SELECT session_id, user_id, COALESCE(device_info, ''), COALESCE(ip_address, ''), last_activity, expires_at, created_at 
	          FROM user_sessions WHERE user_id = $1 AND expires_at > NOW() ORDER BY created_at DESC`

	rows, err := s.db.Query(query, userID)
	if err != nil {
		log.Printf("Error querying sessions: %v", err)
		return nil, err
	}
	defer rows.Close()

	var sessions []*models.UserSession

	for rows.Next() {
		var session models.UserSession
		var lastActivity sql.NullTime
		var expiresAt time.Time
		var createdAt time.Time

		if err := rows.Scan(
			&session.SessionID, &session.UserID, &session.DeviceInfo, &session.IPAddress,
			&lastActivity, &expiresAt, &createdAt,
		); err != nil {
			log.Printf("Error scanning session: %v", err)
			return nil, err
		}

		// Convert time.Time to string
		if lastActivity.Valid {
			session.LastActivity = lastActivity.Time.Format(time.RFC3339Nano)
		} else {
			session.LastActivity = ""
		}
		session.ExpiresAt = expiresAt.Format(time.RFC3339Nano)
		session.CreatedAt = createdAt.Format(time.RFC3339Nano)

		sessions = append(sessions, &session)
	}

	if err = rows.Err(); err != nil {
		log.Printf("Error iterating sessions: %v", err)
		return nil, err
	}

	log.Printf("Retrieved %d sessions for user: %s", len(sessions), userID)
	return sessions, nil
}

func (s *UserService) Logout(userID string, authHeader string) error {
	// Extract token from Authorization header
	token := strings.TrimPrefix(authHeader, "Bearer ")

	// Delete session
	query := `DELETE FROM user_sessions WHERE user_id = $1 AND access_token = $2`
	result, err := s.db.Exec(query, userID, token)
	if err != nil {
		log.Printf("Error deleting session: %v", err)
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		log.Printf("Error checking rows affected: %v", err)
		return err
	}

	log.Printf("Logout: Deleted %d sessions for user: %s", rowsAffected, userID)
	return nil
}