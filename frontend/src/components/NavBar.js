// src/components/NavBar.js
import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import './NavBar.css';

const NavBar = ({ userRole, onLogout }) => {
    const navigate = useNavigate();
    const location = useLocation();

    // Hide the NavBar on /login route or if no user role is provided.
    if (location.pathname === '/login' || !userRole) {
        return null;
    }

    const isAdminOrManager = (userRole === 'Admin' || userRole === 'Manager');

    const handleLogout = () => {
        if (onLogout) {
            onLogout();
        }
        navigate('/login');
    };

    return (
        <nav className="navbar">
            <div className="navbar-left">
                <ul className="navbar-links">
                    {isAdminOrManager ? (
                        <>
                            <li><Link to="/admin-dashboard">לוח מחוונים</Link></li>
                            <li><Link to="/employee-schedule-list">לוח משמרות</Link></li>
                            <li><Link to="/notes">הערות</Link></li>
                            <li><Link to="/user-management">ניהול משתמשים</Link></li>
                            <li><Link to="/blocker">חוסם</Link></li>
                            <li><Link to="/schedule-communication">ניהול תזכורות ומשמרות</Link></li>
                        </>
                    ) : (
                        <>
                            <li><Link to="/employee-dashboard">לוח המשמרות שלי</Link></li>
                        </>
                    )}
                </ul>
            </div>
            <div className="navbar-right">
                <div className="navbar-logo">לוח משמרות עובדים</div>
                <button className="logout-button" onClick={handleLogout}>התנתק</button>
            </div>
        </nav>
    );
};

export default NavBar;
