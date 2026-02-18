import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import './PermissionsModal.css';
import {
    fetchAllPermissions,
    fetchRolePermissions,
    updateRolePermissions
} from '../services/api';

// Mapping permission keys to Hebrew translations
const permissionTranslations = {
    employee_view_dashboard: "עובד - צפייה בלוח מחוונים",
    employee_create_shift: "עובד - יצירת משמרת",
    employee_edit_own_shift: "עובד - עריכת משמרת משלו",
    employee_delete_own_shift: "עובד - מחיקת משמרת משלו",
    employee_view_own_notes: "עובד - צפייה בהערות אישיות",
    employee_create_own_note: "עובד - יצירת הערה אישית",
    employee_edit_own_note: "עובד - עריכת הערה אישית",
    employee_send_shifts: "עובד - שליחת משמרות",
    manager_view_admin_dashboard: "מנהל - צפייה בלוח מחוונים מנהלי",
    manager_edit_admin_dashboard: "מנהל - עריכת לוח מחוונים מנהלי",
    manager_add_shift: "מנהל - הוספת משמרת",
    manager_edit_shift: "מנהל - עריכת משמרת",
    manager_delete_shift: "מנהל - מחיקת משמרת",
    manager_manage_shift_notes: "מנהל - ניהול הערות משמרת",
    manager_open_week_registration: "מנהל - פתיחת רישום שבועי",
    manager_view_employees_schedule: "מנהל - צפייה בלוח זמנים של עובדים",
    manager_view_notes: "מנהל - צפייה בהערות",
    manager_handle_notes: "מנהל - טיפול בהערות",
    manager_manage_users: "מנהל - ניהול משתמשים",
    manager_manage_company_limits: "מנהל - ניהול הגבלות חברה",
    manager_manage_employee_limits: "מנהל - ניהול הגבלות עובדים",
    manager_manage_blockers: "מנהל - ניהול חסמים",
    manager_create_template: "מנהל - יצירת תבנית",
    manager_edit_template: "מנהל - עריכת תבנית",
    manager_delete_template: "מנהל - מחיקת תבנית",
    manager_add_reminder: "מנהל - הוספת תזכורת",
    manager_edit_reminder: "מנהל - עריכת תזכורת",
    manager_delete_reminder: "מנהל - מחיקת תזכורת",
    manager_send_manual_notification: "מנהל - שליחת התראה ידנית",
    manager_view_weekly_registration: "מנהל - צפייה ברישום שבועי",
    manager_publish_shifts: "מנהל - פרסום משמרות",
    manager_view_daily_arrivals: "מנהל - צפייה בהגעות יומיות",
    manager_manage_static_shifts: "מנהל - ניהול משמרות קבועות",
    manager_manage_templates: "מנהל - ניהול תבניות",
    manager_manage_reminders: "מנהל - ניהול תזכורות",
    manager_manage_arrivals: "מנהל - ניהול הגעות",
    manager_manage_submission_status: "מנהל - ניהול סטטוס הגשות",
    manager_manage_wanted: "מנהל - ניהול דרישות",
    manager_manage_wanted_total: "מנהל - ניהול סך כל הדרישות",
    manager_copy_wanted: "מנהל - העתקת דרישות",
    admin_manage_roles: "מנהל מערכת - ניהול תפקידים",
    manager_manage_skills: "מנהל - ניהול מיומנויות",
    manage_tenure_start_date: "ניהול תאריך התחלה / תחילת ותק"
};

const PermissionsModal = ({ roleId, onClose, onPermissionsUpdated }) => {
    // availablePermissions will be an array of objects like { id, permission_name }
    const [availablePermissions, setAvailablePermissions] = useState([]);
    // rolePermissions will be an array of permission IDs (numbers)
    const [rolePermissions, setRolePermissions] = useState([]);

    useEffect(() => {
        async function loadPermissions() {
            try {
                // Fetch all permissions
                const allPerms = await fetchAllPermissions();
                setAvailablePermissions(allPerms);
                // Fetch current permissions for this role (expecting an array of IDs)
                const currentPermIds = await fetchRolePermissions(roleId);
                setRolePermissions(currentPermIds);
            } catch (err) {
                console.error("Error fetching permissions:", err);
            }
        }
        loadPermissions();
    }, [roleId]);

    const handleCheckboxChange = (permId) => {
        if (rolePermissions.includes(permId)) {
            setRolePermissions(rolePermissions.filter(id => id !== permId));
        } else {
            setRolePermissions([...rolePermissions, permId]);
        }
    };

    const handleSave = async () => {
        try {
            // updateRolePermissions expects an array of permission IDs
            await updateRolePermissions(roleId, rolePermissions);
            if (onPermissionsUpdated) {
                onPermissionsUpdated(roleId, rolePermissions);
            }
            onClose();
        } catch (err) {
            console.error("Error updating role permissions:", err);
            alert("עדכון הרשאות לתפקיד נכשל.");
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h3>ניהול הרשאות לתפקיד {roleId}</h3>
                <div className="permissions-list">
                    {availablePermissions.map(perm => (
                        <div key={perm.id} className="permission-item">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={rolePermissions.includes(perm.id)}
                                    onChange={() => handleCheckboxChange(perm.id)}
                                />
                                {permissionTranslations[perm.permission_name] || perm.permission_name}
                            </label>
                        </div>
                    ))}
                </div>
                <div className="modal-actions">
                    <button className="save-button" onClick={handleSave}>שמור</button>
                    <button className="cancel-button" onClick={onClose}>ביטול</button>
                </div>
            </div>
        </div>
    );
};

PermissionsModal.propTypes = {
    roleId: PropTypes.number.isRequired,
    onClose: PropTypes.func.isRequired,
    onPermissionsUpdated: PropTypes.func
};

export default PermissionsModal;
