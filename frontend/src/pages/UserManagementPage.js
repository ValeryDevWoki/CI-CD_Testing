// src/pages/UserManagementPage.jsx

import React, { useEffect, useState } from 'react';
import NavBar from '../components/NavBar';
import {
    fetchAllUsers,
    updateUser,
    createUser,
    fetchCompanyDailyLimits,
    updateCompanyDailyLimits,
    fetchEmployeeDailyLimits,
    updateEmployeeDailyLimits,
    fetchRoles,
    createRole,
    updateRole,
    deleteRole,
    updateRolePermissions,
    fetchSkills,
    createSkill,
    updateSkill,
    deleteSkill,
    // Manager feature additions:
    fetchManagerCategories,
    createManagerCategory,
    updateManagerCategory,
    deleteManagerCategory,
    fetchManagers,
    createManager,
    updateManager,
    deleteManager,
    fetchEmployeesWithManager,
    assignEmployeeManager,
    unassignEmployeeManager
} from '../services/api';
import './UserManagementPage.css';
import UserCreationModal from '../components/UserCreationModal';
import PermissionsModal from '../components/PermissionsModal';

const weekDays = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export default function UserManagementPage() {
    const [selectedTab, setSelectedTab] = useState('users');

    // Users & managers
    const [users, setUsers] = useState([]);
    const [usersWithManagers, setUsersWithManagers] = useState([]); // extra for manager assignments
    const [managers, setManagers] = useState([]);
    const [managerCategories, setManagerCategories] = useState([]);
    const [managerCategoryEdit, setManagerCategoryEdit] = useState(null);
    const [managerCategoryTitle, setManagerCategoryTitle] = useState('');

    const [hideInactive, setHideInactive] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [editUserId, setEditUserId] = useState(null);
    const [skillSearch, setSkillSearch] = useState('');
    const [showUserCreationModal, setShowUserCreationModal] = useState(false);

    // Logged-in user permissions (for enabling/disabling start date edits)
    const [myPerms, setMyPerms] = useState(new Set());
    const [myRole, setMyRole] = useState(null);

    useEffect(() => {
        try {
            const raw = localStorage.getItem('yardena_user');
            if (!raw) return;
            const u = JSON.parse(raw);
            if (u?.role) setMyRole(u.role);
            if (Array.isArray(u?.permissions)) setMyPerms(new Set(u.permissions));
        } catch (_e) {
            // ignore
        }
    }, []);

    const canEditStartDate = myRole === 'Admin' || myRole === 'Manager' || myPerms.has('manage_tenure_start_date');

    // Limit mgmt
    const [companyLimits, setCompanyLimits] = useState([]);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [employeeLimits, setEmployeeLimits] = useState([]);

    // Roles mgmt
    const [roles, setRoles] = useState([]);
    const [editingRoleId, setEditingRoleId] = useState(null);
    const [roleNameEdit, setRoleNameEdit] = useState('');
    const [showPermissionsModal, setShowPermissionsModal] = useState(false);
    const [currentRoleId, setCurrentRoleId] = useState(null);

    // Skills mgmt
    const [skills, setSkills] = useState([]);
    const [editingSkillId, setEditingSkillId] = useState(null);
    const [skillNameEdit, setSkillNameEdit] = useState('');



    // ========== LOAD DATA =============
    useEffect(() => {
        // Load all users (for legacy), also load users+managers
        async function loadUsers() {
            try {
                const toDateInput = (v) => {
                    if (!v) return '';
                    // backend may return ISO timestamp; <input type="date"> requires YYYY-MM-DD
                    const s = String(v);
                    return s.length >= 10 ? s.slice(0, 10) : s;
                };
                const [data, usersWithMgr, mgrs, mgrCats] = await Promise.all([
                    fetchAllUsers(),
                    fetchEmployeesWithManager(),
                    fetchManagers(),
                    fetchManagerCategories()
                ]);
                setUsers(data.map(u => ({
                    ...u,
                    fullName: u.full_name,
                    maxHours: u.max_hours,
                    maxDays: u.max_days,
                    startDate: toDateInput(u.start_date),
                    skills: u.skills || []
                })));
                setUsersWithManagers(usersWithMgr);
                setManagers(mgrs);
                setManagerCategories(mgrCats);
            } catch (err) {
                console.error("שגיאה בטעינת משתמשים/מנהלים:", err);
            }
        }
        loadUsers();
    }, []);

    // NOTE: Yardena backend in some environments does not expose /api/my-permissions.
    // We rely on role (Admin/Manager) and optional permissions embedded in the login payload.

    useEffect(() => {
        async function loadRoles() {
            try {
                const data = await fetchRoles();
                setRoles(data);
            } catch (err) {
                console.error("שגיאה בטעינת תפקידים:", err);
            }
        }
        loadRoles();
    }, []);

    useEffect(() => {
        async function loadAllSkills() {
            try {
                const data = await fetchSkills();
                setSkills(data);
            } catch (err) {
                console.error("שגיאה בטעינת כישורים:", err);
            }
        }
        loadAllSkills();
    }, []);

    useEffect(() => {
        if (selectedTab === 'limits') {
            async function loadCompanyLimits() {
                try {
                    const data = await fetchCompanyDailyLimits();
                    if (!data || data.length === 0) {
                        setCompanyLimits(weekDays.map(day => ({ day_name: day, max_hours: 0 })));
                    } else {
                        const limitsMap = {};
                        data.forEach(item => { limitsMap[item.day_name] = item; });
                        setCompanyLimits(
                            weekDays.map(day => limitsMap[day] || { day_name: day, max_hours: 0 })
                        );
                    }
                } catch (err) {
                    console.error("שגיאה בטעינת מגבלות חברה:", err);
                    setCompanyLimits(weekDays.map(day => ({ day_name: day, max_hours: 0 })));
                }
            }
            loadCompanyLimits();
        }
    }, [selectedTab]);

    useEffect(() => {
        if (selectedTab === 'limits' && selectedEmployeeId) {
            async function loadEmployeeLimits() {
                try {
                    const data = await fetchEmployeeDailyLimits(selectedEmployeeId);
                    setEmployeeLimits(data || []);
                } catch (err) {
                    console.error("שגיאה בטעינת מגבלות עובד:", err);
                    setEmployeeLimits([]);
                }
            }
            loadEmployeeLimits();
        } else {
            setEmployeeLimits([]);
        }
    }, [selectedTab, selectedEmployeeId]);

    // ========== USERS HANDLERS =========
    const handleEdit = userId => {
        setEditUserId(userId);
        setSkillSearch('');
    };
    const handleCancel = () => {
        setEditUserId(null);
        setSkillSearch('');
    };

    // Extra for manager features (find if user is a manager)
    const getManagerForEmployee = (empId) => {
        const rec = usersWithManagers.find(e => e.employee_id === empId);
        return rec
            ? { id: rec.manager_id, name: rec.manager_name, category: rec.manager_category }
            : null;
    };
    const isManagerUser = (user) =>
        managers.some(m => m.full_name === user.fullName);

    // Find manager record for user (by name)
    const getManagerRecForUser = (user) =>
        managers.find(m => m.full_name === user.fullName);

    // Called when save
    const handleSave = async (user, managerSettings) => {
        const body = {
            id: user.id,
            full_name: user.fullName,
            email: user.email,
            phone: user.phone,
            role: user.role,
            status: user.status,
            skills: user.skills,
            max_hours: user.maxHours,
            max_days: user.maxDays,
            // Task 248/250: tenure start date
            // New users: default to today if empty; existing users: send current value.
            start_date: user.startDate || (user.isNew ? new Date().toISOString().slice(0, 10) : null)
        };
        try {
            const updated = user.isNew
                ? await createUser(body)
                : await updateUser(body);
            // Some backends don't echo start_date back yet. Keep the locally edited value in that case.
            const echoedStart = updated?.start_date ? String(updated.start_date).slice(0, 10) : null;
            const mapped = {
                ...updated,
                fullName: updated.full_name,
                maxHours: updated.max_hours,
                maxDays: updated.max_days,
                startDate: echoedStart ?? (user.startDate || ''),
                skills: updated.skills || []
            };
            setUsers(prev => prev.map(u => u.id === mapped.id ? mapped : u));
            setEditUserId(null);
            setSkillSearch('');
            // --- Manager logic ---
            // 1. Is manager checkbox checked?
            if (managerSettings && managerSettings.isManager) {
                // If not already a manager, create in managers table
                let mgrRec = getManagerRecForUser(user);
                if (!mgrRec) {
                    const created = await createManager({
                        full_name: mapped.fullName,
                        category_id: managerSettings.categoryId
                    });
                    setManagers(prev => [...prev, created]);
                } else {
                    // If already a manager, maybe update category
                    if (mgrRec.category_id !== managerSettings.categoryId) {
                        const updatedMgr = await updateManager(mgrRec.id, {
                            full_name: mapped.fullName,
                            category_id: managerSettings.categoryId
                        });
                        setManagers(prev => prev.map(m => m.id === mgrRec.id ? updatedMgr : m));
                    }
                }
            } else {
                // Not a manager anymore, remove if present
                let mgrRec = getManagerRecForUser(user);
                if (mgrRec) {
                    await deleteManager(mgrRec.id);
                    setManagers(prev => prev.filter(m => m.id !== mgrRec.id));
                }
            }
            // 2. Employee-manager assignment (may assign anyone)
            if (managerSettings && managerSettings.assignedManagerId) {
                await assignEmployeeManager({
                    employee_id: mapped.id,
                    manager_id: managerSettings.assignedManagerId
                });
            } else {
                await unassignEmployeeManager(mapped.id);
            }
            // 3. Reload users+managers for updated display
            const updatedList = await fetchEmployeesWithManager();
            setUsersWithManagers(updatedList);
        } catch (err) {
            console.error("שגיאה בשמירת משתמש:", err);
            alert("נכשל בשמירת השינויים למשתמש.");
        }
    };

    // for local UI state (checkbox/select) per user
    const [managerSettingsMap, setManagerSettingsMap] = useState({});
    const updateManagerSetting = (userId, key, value) => {
        setManagerSettingsMap(prev => ({
            ...prev,
            [userId]: {
                ...prev[userId],
                [key]: value
            }
        }));
    };

    const handleFieldChange = (userId, field, value) => {
        setUsers(prev =>
            prev.map(u => {
                if (u.id !== userId) return u;
                let newVal = value;
                if (field === 'maxDays') {
                    const n = Number(value) || 1;
                    newVal = Math.max(1, Math.min(6, n));
                }
                return { ...u, [field]: newVal };
            })
        );
    };

    const handleRemoveSkill = (userId, skillName) => {
        setUsers(prev =>
            prev.map(u =>
                u.id !== userId
                    ? u
                    : { ...u, skills: u.skills.filter(s => s !== skillName) }
            )
        );
    };
    const handleAddSkill = (userId, skillName) => {
        setUsers(prev =>
            prev.map(u => {
                if (u.id !== userId) return u;
                if (!u.skills.includes(skillName)) {
                    return { ...u, skills: [...u.skills, skillName] };
                }
                return u;
            })
        );
    };
    const filterSkillOptions = user => {
        const lowerSearch = skillSearch.toLowerCase();
        const userSkills = new Set(user.skills);
        return skills
            .filter(s => !userSkills.has(s.skill_name)
                && (skillSearch.trim() === '' || s.skill_name.toLowerCase().includes(lowerSearch)))
            .map(s => s.skill_name);
    };
    const handleNewUser = () => setShowUserCreationModal(true);
    const handleUserCreated = newUser => {
        const mapped = {
            ...newUser,
            fullName: newUser.full_name,
            maxHours: newUser.max_hours,
            maxDays: newUser.max_days,
            skills: newUser.skills || []
        };
        setUsers(prev => [...prev, mapped]);
        setShowUserCreationModal(false);
    };

    // ========== LIMITS HANDLERS ==========
    const handleCompanyLimitChange = (dayName, value) => {
        setCompanyLimits(prev =>
            prev.map(l => l.day_name === dayName ? { ...l, max_hours: Number(value) } : l)
        );
    };
    const handleUpdateCompanyLimits = async () => {
        try {
            const updated = await updateCompanyDailyLimits(companyLimits);
            setCompanyLimits(updated);
            alert("המגבלות היומיות של החברה עודכנו בהצלחה.");
        } catch (err) {
            console.error("שגיאה בעדכון מגבלות החברה:", err);
            alert("נכשל בעדכון מגבלות החברה.");
        }
    };
    const handleEmployeeLimitChange = (dayName, value) => {
        setEmployeeLimits(prev => {
            const idx = prev.findIndex(l => l.day_name === dayName);
            if (idx >= 0) {
                const next = [...prev];
                next[idx] = { ...next[idx], max_hours: Number(value) };
                return next;
            }
            return [...prev, { day_name: dayName, max_hours: Number(value) }];
        });
    };
    const computedEmployeeLimits = weekDays.map(day => {
        const override = employeeLimits.find(l => l.day_name === day);
        if (override) return override;
        const comp = companyLimits.find(l => l.day_name === day);
        return { day_name: day, max_hours: comp ? comp.max_hours : 0 };
    });
    const handleUpdateEmployeeLimits = async () => {
        if (!selectedEmployeeId) return;
        try {
            const updated = await updateEmployeeDailyLimits(selectedEmployeeId, employeeLimits);
            setEmployeeLimits(updated);
            alert("המגבלות היומיות של העובד עודכנו בהצלחה.");
        } catch (err) {
            console.error("שגיאה בעדכון מגבלות העובד:", err);
            alert("נכשל בעדכון מגבלות העובד.");
        }
    };

    // ========== ROLES HANDLERS ==========
    const startEditingRole = roleId => {
        const role = roles.find(r => r.id === roleId);
        setEditingRoleId(roleId);
        setRoleNameEdit(role.role_name);
    };
    const cancelRoleEditing = () => {
        setEditingRoleId(null);
        setRoleNameEdit('');
    };
    const saveRoleEdit = async roleId => {
        try {
            const updatedRole = await updateRole(roleId, { role_name: roleNameEdit });
            setRoles(prev => prev.map(r => r.id === roleId ? updatedRole : r));
            setEditingRoleId(null);
            setRoleNameEdit('');
        } catch (err) {
            console.error("שגיאה בעדכון תפקיד:", err);
            alert("נכשל בעדכון התפקיד.");
        }
    };
    const handleNewRole = async () => {
        try {
            const newRole = await createRole({ role_name: 'תפקיד חדש' });
            setRoles(prev => [...prev, newRole]);
        } catch (err) {
            console.error("שגיאה ביצירת תפקיד:", err);
            alert("נכשל ביצירת תפקיד.");
        }
    };
    const handleDeleteRole = async roleId => {
        try {
            await deleteRole(roleId);
            setRoles(prev => prev.filter(r => r.id !== roleId));
        } catch (err) {
            console.error("שגיאה במחיקת תפקיד:", err);
            alert("נכשל במחיקת התפקיד.");
        }
    };
    const handleManagePermissions = roleId => {
        setCurrentRoleId(roleId);
        setShowPermissionsModal(true);
    };

    // ========== SKILLS HANDLERS ==========
    const startEditingSkill = skillId => {
        const s = skills.find(s => s.id === skillId);
        setEditingSkillId(skillId);
        setSkillNameEdit(s.skill_name);
    };
    const cancelSkillEditing = () => {
        setEditingSkillId(null);
        setSkillNameEdit('');
    };
    const saveSkillEdit = async skillId => {
        try {
            const updated = await updateSkill(skillId, { skill_name: skillNameEdit });
            setSkills(prev => prev.map(s => s.id === skillId ? updated : s));
            setEditingSkillId(null);
            setSkillNameEdit('');
        } catch (err) {
            console.error("שגיאה בעדכון כישור:", err);
            alert("נכשל בעדכון הכישור.");
        }
    };
    const handleNewSkill = async () => {
        try {
            const newSkill = await createSkill({ skill_name: 'כישור חדש' });
            setSkills(prev => [...prev, newSkill]);
        } catch (err) {
            console.error("שגיאה ביצירת כישור:", err);
            alert("נכשל ביצירת הכישור.");
        }
    };
    const handleDeleteSkill = async skillId => {
        try {
            await deleteSkill(skillId);
            setSkills(prev => prev.filter(s => s.id !== skillId));
        } catch (err) {
            console.error("שגיאה במחיקת כישור:", err);
            alert("נכשל במחיקת הכישור.");
        }
    };

    // ========== MANAGER CATEGORIES HANDLERS ==========
    const handleManagerCategoryEdit = (cat) => {
        setManagerCategoryEdit(cat.id);
        setManagerCategoryTitle(cat.title);
    };
    const handleManagerCategorySave = async (catId) => {
        try {
            await updateManagerCategory(catId, { title: managerCategoryTitle });
            const updated = await fetchManagerCategories();
            setManagerCategories(updated);
            setManagerCategoryEdit(null);
            setManagerCategoryTitle('');
        } catch (err) {
            alert('שגיאה בעדכון קטגוריה');
        }
    };
    const handleManagerCategoryCancel = () => {
        setManagerCategoryEdit(null);
        setManagerCategoryTitle('');
    };
    const handleManagerCategoryDelete = async (catId) => {
        try {
            await deleteManagerCategory(catId);
            setManagerCategories(prev => prev.filter(c => c.id !== catId));
        } catch (err) {
            alert('שגיאה במחיקת קטגוריה');
        }
    };
    const handleManagerCategoryAdd = async () => {
        const title = prompt('הזן שם קטגוריית מנהל חדשה:');
        if (!title) return;
        try {
            await createManagerCategory({ title });
            const updated = await fetchManagerCategories();
            setManagerCategories(updated);
        } catch {
            alert('שגיאה ביצירת קטגוריה');
        }
    };

    // ========== UI ==========
    return (
        <div className="user-management-page">
            <NavBar />

            <div className="header-title-row">
                <h2>ניהול משתמשים</h2>
            </div>

            <div className="tabs">
                <button className={selectedTab === 'users' ? 'active' : ''}
                        onClick={() => setSelectedTab('users')}
                >משתמשים</button>
                <button className={selectedTab === 'limits' ? 'active' : ''}
                        onClick={() => setSelectedTab('limits')}
                >ניהול מגבלות</button>
                <button className={selectedTab === 'skills' ? 'active' : ''}
                        onClick={() => setSelectedTab('skills')}
                >ניהול כישורים</button>
                <button className={selectedTab === 'roles' ? 'active' : ''}
                        onClick={() => setSelectedTab('roles')}
                >ניהול תפקידים</button>
                <button className={selectedTab === 'managerCategories' ? 'active' : ''}
                        onClick={() => setSelectedTab('managerCategories')}
                >ניהול קטגוריות מנהלים</button>
            </div>

            {selectedTab === 'users' && (
                <>
                    <div className="controls-row">
                        <button className="action-button" onClick={handleNewUser}>
                            יצירת משתמש חדש
                        </button>

                        <label className="hide-inactive-label">
                            <input
                                type="checkbox"
                                checked={hideInactive}
                                onChange={e => setHideInactive(e.target.checked)}
                            />
                            {' '}הסתר משתמשים לא פעילים
                        </label>

                        <input
                            type="text"
                            className="search-input"
                            placeholder="חפש (מייל או טלפון)..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <table className="user-table">
                        <thead>
                        <tr>
                            <th>שם מלא</th>
                            <th>אימייל</th>
                            <th>טלפון</th>
                            <th>תפקיד</th>
                            <th>תאריך התחלה</th>
                            <th>ימי עבודה</th>
                            <th>כישורים</th>
                            <th>סטטוס</th>
                            <th>מנהל</th>
                            <th>האם מנהל</th>
                            <th>פעולות</th>
                        </tr>
                        </thead>
                        <tbody>
                        {users
                            .filter(u => {
                                const showByStatus =
                                    !hideInactive ||
                                    u.status === 'Active' ||
                                    u.id === editUserId;
                                const lower = searchTerm.trim().toLowerCase();
                                const showBySearch =
                                    !lower ||
                                    (u.email || '').toLowerCase().includes(lower) ||
                                    (u.phone || '').toLowerCase().includes(lower);
                                return showByStatus && showBySearch;
                            })
                            .map(user => {
                                const isEditing = user.id === editUserId;
                                const availableSkills = filterSkillOptions(user);
                                const managerInfo = getManagerForEmployee(user.id);
                                const isManager = !!getManagerRecForUser(user);
                                const managerSettings = managerSettingsMap[user.id] || {
                                    isManager: isManager,
                                    categoryId: isManager ? getManagerRecForUser(user)?.category_id : '',
                                    assignedManagerId: managerInfo?.id || ''
                                };
                                // Managers available for dropdown (exclude self)
                                const availableManagers = managers.filter(m =>
                                    user.fullName !== m.full_name
                                );
                                return (
                                    <tr key={user.id}>
                                        <td>
                                            {isEditing ? (
                                                <input
                                                    type="text"
                                                    value={user.fullName}
                                                    onChange={e =>
                                                        handleFieldChange(user.id, 'fullName', e.target.value)
                                                    }
                                                />
                                            ) : (
                                                user.fullName
                                            )}
                                        </td>
                                        <td className="email-cell">
                                            {isEditing ? (
                                                <input
                                                    type="email"
                                                    value={user.email}
                                                    onChange={e =>
                                                        handleFieldChange(user.id, 'email', e.target.value)
                                                    }
                                                />
                                            ) : (
                                                <span title={user.email}>{user.email}</span>
                                            )}
                                        </td>
                                        <td>
                                            {isEditing ? (
                                                <input
                                                    type="text"
                                                    value={user.phone || ''}
                                                    inputMode="numeric"
                                                    pattern="[0-9]*"
                                                    maxLength={10}
                                                    placeholder="05XXXXXXXX"
                                                    onChange={(e) =>
                                                        handleFieldChange(user.id, 'phone', e.target.value.replace(/\D/g, '').slice(0, 10))
                                                    }
                                                    onPaste={(e) => {
                                                        e.preventDefault();
                                                        const text = (e.clipboardData || window.clipboardData).getData('text');
                                                        handleFieldChange(user.id, 'phone', String(text).replace(/\D/g, '').slice(0, 10));
                                                    }}
                                                />
                                            ) : (
                                                user.phone
                                            )}
                                        </td>
                                        <td>
                                            {isEditing ? (
                                                <select
                                                    value={user.role}
                                                    onChange={e =>
                                                        handleFieldChange(user.id, 'role', e.target.value)
                                                    }
                                                >
                                                    {roles.map(r => (
                                                        <option key={r.id} value={r.role_name}>
                                                            {r.role_name}
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                user.role
                                            )}
                                        </td>
                                        <td>
                                            {isEditing ? (
                                                <input
                                                    type="date"
                                                    value={user.startDate || ''}
                                                    onChange={(e) => handleFieldChange(user.id, 'startDate', e.target.value)}
                                                    disabled={!canEditStartDate}
                                                    title={!canEditStartDate ? 'אין הרשאה לעריכת תאריך התחלה' : ''}
                                                />
                                            ) : (
                                                user.startDate || ''
                                            )}
                                        </td>
                                        <td>
                                            {isEditing ? (
                                                <input
                                                    type="number"
                                                    value={user.maxDays}
                                                    min={1}
                                                    max={6}
                                                    onChange={e =>
                                                        handleFieldChange(user.id, 'maxDays', e.target.value)
                                                    }
                                                    style={{ width: '60px' }}
                                                />
                                            ) : (
                                                user.maxDays
                                            )}
                                        </td>
                                        <td>
                                            {isEditing ? (
                                                <div className="skills-edit-container">
                                                    <div className="skill-search-bar">
                                                        <input
                                                            type="text"
                                                            placeholder="חפש כישורים..."
                                                            value={skillSearch}
                                                            onChange={e => setSkillSearch(e.target.value)}
                                                        />
                                                        {availableSkills.length > 0 && (
                                                            <div className="skill-suggestions">
                                                                {availableSkills.map(opt => (
                                                                    <div
                                                                        key={opt}
                                                                        className="suggestion"
                                                                        onClick={() =>
                                                                            handleAddSkill(user.id, opt)
                                                                        }
                                                                    >
                                                                        {opt}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {skillSearch.length > 0 && availableSkills.length === 0 && (
                                                            <div className="no-match">אין תוצאות</div>
                                                        )}
                                                    </div>
                                                    <div className="selected-skills-grid">
                                                        {user.skills.map(skill => (
                                                            <div key={skill} className="skill-tag">
                                                                {skill}
                                                                <button
                                                                    type="button"
                                                                    className="action-button remove-skill-btn"
                                                                    onClick={() =>
                                                                        handleRemoveSkill(user.id, skill)
                                                                    }
                                                                >
                                                                    x
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="readonly-skills-scroll">
                                                    {user.skills.map(skill => (
                                                        <div key={skill} className="readonly-skill-tag">
                                                            {skill}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            {isEditing ? (
                                                <select
                                                    value={user.status}
                                                    onChange={e =>
                                                        handleFieldChange(user.id, 'status', e.target.value)
                                                    }
                                                >
                                                    <option value="Active">פעיל</option>
                                                    <option value="Not Active">לא פעיל</option>
                                                    <option value="Terminated">מפוטר</option>
                                                </select>
                                            ) : (
                                                user.status
                                            )}
                                        </td>
                                        {/* ========== MANAGER ASSIGNMENT ========== */}
                                        <td>
                                            {isEditing ? (
                                                <>
                                                    <select
                                                        value={managerSettings.assignedManagerId || ''}
                                                        onChange={e =>
                                                            updateManagerSetting(user.id, 'assignedManagerId', e.target.value)
                                                        }
                                                    >
                                                        <option value="">— ללא —</option>
                                                        {availableManagers.map(mgr => (
                                                            <option key={mgr.id} value={mgr.id}>
                                                                {mgr.full_name} ({managerCategories.find(c => c.id === mgr.category_id)?.title || ''})
                                                            </option>
                                                        ))}
                                                    </select>
                                                </>
                                            ) : (
                                                managerInfo
                                                    ? (
                                                        <span>
                                                            {managerInfo.name}
                                                            <span style={{ color: "#888", fontSize: 12 }}>
                                                                {managerInfo.category ? ` (${managerInfo.category})` : ''}
                                                            </span>
                                                        </span>
                                                    )
                                                    : <span style={{ color: "#bbb" }}>—</span>
                                            )}
                                        </td>
                                        <td>
                                            {isEditing ? (
                                                <>
                                                    <label>
                                                        <input
                                                            type="checkbox"
                                                            checked={managerSettings.isManager || false}
                                                            onChange={e => {
                                                                updateManagerSetting(user.id, 'isManager', e.target.checked);
                                                            }}
                                                        />
                                                        {' '}מנהל
                                                    </label>
                                                    {/* If checked, show category */}
                                                    {managerSettings.isManager && (
                                                        <select
                                                            value={managerSettings.categoryId || ''}
                                                            onChange={e => updateManagerSetting(user.id, 'categoryId', e.target.value)}
                                                        >
                                                            <option value="">— קטגוריה —</option>
                                                            {managerCategories.map(cat => (
                                                                <option key={cat.id} value={cat.id}>
                                                                    {cat.title}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </>
                                            ) : (
                                                isManager
                                                    ? (
                                                        <span>
                                                            כן
                                                            <span style={{ color: "#888", fontSize: 12 }}>
                                                                {getManagerRecForUser(user) && managerCategories.find(c => c.id === getManagerRecForUser(user)?.category_id)
                                                                    ? ` (${managerCategories.find(c => c.id === getManagerRecForUser(user)?.category_id)?.title})`
                                                                    : ''}
                                                            </span>
                                                        </span>
                                                    )
                                                    : <span style={{ color: "#bbb" }}>—</span>
                                            )}
                                        </td>
                                        <td>
                                            {isEditing ? (
                                                <>
                                                    <button
                                                        className="action-button"
                                                        onClick={() => handleSave(user, managerSettingsMap[user.id])}
                                                    >
                                                        שמור
                                                    </button>
                                                    <button className="action-button" onClick={handleCancel}>
                                                        ביטול
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    className="action-button"
                                                    onClick={() => {
                                                        setManagerSettingsMap(ms => ({
                                                            ...ms,
                                                            [user.id]: {
                                                                isManager: isManager,
                                                                categoryId: isManager ? getManagerRecForUser(user)?.category_id : '',
                                                                assignedManagerId: managerInfo?.id || ''
                                                            }
                                                        }));
                                                        handleEdit(user.id);
                                                    }}
                                                >
                                                    ערוך
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {showUserCreationModal && (
                        <UserCreationModal
                            onClose={() => setShowUserCreationModal(false)}
                            onUserCreated={handleUserCreated}
                        />
                    )}
                </>
            )}

            {selectedTab === 'managerCategories' && (
                <div className="manager-categories-mgmt">
                    <h3>ניהול קטגוריות מנהלים</h3>
                    <button className="action-button" onClick={handleManagerCategoryAdd}>
                        הוסף קטגוריה חדשה
                    </button>
                    <table className="manager-categories-table">
                        <thead>
                        <tr>
                            <th>ID</th>
                            <th>שם קטגוריה</th>
                            <th>פעולות</th>
                        </tr>
                        </thead>
                        <tbody>
                        {managerCategories.map(cat => (
                            <tr key={cat.id}>
                                <td>{cat.id}</td>
                                <td>
                                    {managerCategoryEdit === cat.id ? (
                                        <input
                                            type="text"
                                            value={managerCategoryTitle}
                                            onChange={e => setManagerCategoryTitle(e.target.value)}
                                        />
                                    ) : (
                                        cat.title
                                    )}
                                </td>
                                <td>
                                    {managerCategoryEdit === cat.id ? (
                                        <>
                                            <button
                                                className="action-button"
                                                onClick={() => handleManagerCategorySave(cat.id)}
                                            >שמור</button>
                                            <button
                                                className="action-button"
                                                onClick={handleManagerCategoryCancel}
                                            >ביטול</button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                className="action-button"
                                                onClick={() => handleManagerCategoryEdit(cat)}
                                            >ערוך</button>
                                            <button
                                                className="action-button"
                                                onClick={() => handleManagerCategoryDelete(cat.id)}
                                            >מחק</button>
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            )}

            {selectedTab === 'limits' && (
                <div className="limits-management">
                    <h3>מגבלות יומיות לחברה</h3>
                    <table className="limits-table">
                        <thead>
                        <tr>
                            <th>יום</th>
                            <th>שעות מקסימליות</th>
                        </tr>
                        </thead>
                        <tbody>
                        {companyLimits.map(limit => (
                            <tr key={limit.day_name}>
                                <td>{limit.day_name}</td>
                                <td>
                                    <input
                                        type="number"
                                        value={limit.max_hours}
                                        onChange={e =>
                                            handleCompanyLimitChange(limit.day_name, e.target.value)
                                        }
                                    />
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                    <button className="action-button" onClick={handleUpdateCompanyLimits}>
                        עדכן מגבלות לחברה
                    </button>

                    <h3>מגבלות יומיות לעובד</h3>
                    <label>
                        בחר עובד:
                        <select
                            value={selectedEmployeeId}
                            onChange={e => setSelectedEmployeeId(e.target.value)}
                        >
                            <option value="">-- בחר עובד --</option>
                            {users.map(u => (
                                <option key={u.id} value={u.id}>
                                    {u.fullName}
                                </option>
                            ))}
                        </select>
                    </label>
                    {selectedEmployeeId && (
                        <>
                            <table className="limits-table">
                                <thead>
                                <tr>
                                    <th>יום</th>
                                    <th>שעות מקסימליות</th>
                                </tr>
                                </thead>
                                <tbody>
                                {computedEmployeeLimits.map(limit => (
                                    <tr key={limit.day_name}>
                                        <td>{limit.day_name}</td>
                                        <td>
                                            <input
                                                type="number"
                                                value={limit.max_hours}
                                                onChange={e =>
                                                    handleEmployeeLimitChange(
                                                        limit.day_name,
                                                        e.target.value
                                                    )
                                                }
                                            />
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                            <button className="action-button" onClick={handleUpdateEmployeeLimits}>
                                עדכן מגבלות לעובד
                            </button>
                        </>
                    )}
                </div>
            )}

            {selectedTab === 'roles' && (
                <div className="roles-management">
                    <h3>ניהול תפקידים</h3>
                    <button className="action-button" onClick={handleNewRole}>
                        צור תפקיד חדש
                    </button>
                    <table className="roles-table">
                        <thead>
                        <tr>
                            <th>ID</th>
                            <th>שם תפקיד</th>
                            <th>פעולות</th>
                        </tr>
                        </thead>
                        <tbody>
                        {roles.map(role => (
                            <tr key={role.id}>
                                <td>{role.id}</td>
                                <td>
                                    {editingRoleId === role.id ? (
                                        <input
                                            type="text"
                                            value={roleNameEdit}
                                            onChange={e => setRoleNameEdit(e.target.value)}
                                        />
                                    ) : (
                                        role.role_name
                                    )}
                                </td>
                                <td>
                                    {editingRoleId === role.id ? (
                                        <>
                                            <button
                                                className="action-button"
                                                onClick={() => saveRoleEdit(role.id)}
                                            >
                                                שמור
                                            </button>
                                            <button
                                                className="action-button"
                                                onClick={cancelRoleEditing}
                                            >
                                                ביטול
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                className="action-button"
                                                onClick={() => startEditingRole(role.id)}
                                            >
                                                ערוך
                                            </button>
                                            <button
                                                className="action-button"
                                                onClick={() => handleDeleteRole(role.id)}
                                            >
                                                מחק
                                            </button>
                                            <button
                                                className="action-button"
                                                onClick={() => handleManagePermissions(role.id)}
                                            >
                                                הרשאות
                                            </button>
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                    {showPermissionsModal && (
                        <PermissionsModal
                            roleId={currentRoleId}
                            onClose={() => setShowPermissionsModal(false)}
                        />
                    )}
                </div>
            )}

            {selectedTab === 'skills' && (
                <div className="skills-management">
                    <h3>ניהול כישורים</h3>
                    <button className="action-button" onClick={handleNewSkill}>
                        צור כישור חדש
                    </button>
                    <table className="skills-table">
                        <thead>
                        <tr>
                            <th>ID</th>
                            <th>שם כישור</th>
                            <th>פעולות</th>
                        </tr>
                        </thead>
                        <tbody>
                        {skills.map(skill => (
                            <tr key={skill.id}>
                                <td>{skill.id}</td>
                                <td>
                                    {editingSkillId === skill.id ? (
                                        <input
                                            type="text"
                                            value={skillNameEdit}
                                            onChange={e => setSkillNameEdit(e.target.value)}
                                        />
                                    ) : (
                                        skill.skill_name
                                    )}
                                </td>
                                <td>
                                    {editingSkillId === skill.id ? (
                                        <>
                                            <button
                                                className="action-button"
                                                onClick={() => saveSkillEdit(skill.id)}
                                            >
                                                שמור
                                            </button>
                                            <button
                                                className="action-button"
                                                onClick={cancelSkillEditing}
                                            >
                                                ביטול
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                className="action-button"
                                                onClick={() => startEditingSkill(skill.id)}
                                            >
                                                ערוך
                                            </button>
                                            <button
                                                className="action-button"
                                                onClick={() => handleDeleteSkill(skill.id)}
                                            >
                                                מחק
                                            </button>
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
