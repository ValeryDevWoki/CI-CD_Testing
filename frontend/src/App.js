// src/App.js
import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import EmployeeDashboard from './pages/EmployeeDashboard';
import EmployeeScheduleList from './pages/EmployeeScheduleList';
import EmployeeSkillsReport from './pages/EmployeeSkillsReport';
import NotesPage from './pages/NotesPage';
import BlockerManagementPage from './pages/BlockerManagementPage';
import UserManagementPage from './pages/UserManagementPage';
import ScheduleDetail from './pages/ScheduleDetail';
import ScheduleCommunication from './pages/ScheduleCommunication';
import NavBar from './components/NavBar';

function App() {
    // Is the user logged in?
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    // The user’s role: 'admin' / 'manager' / 'employee'
    const [userRole, setUserRole] = useState(null);
    // The full user object from the server: { id, role, name, ... }
    const [user, setUser] = useState(null);

    const handleLogout = () => {
        setIsAuthenticated(false);
        setUserRole(null);
        setUser(null);
        // Optionally call a /api/logout route if you want to destroy the session
    };

    // For convenience
    const isAdminOrManager = (userRole === 'Admin' || userRole === 'Manager');

    // IMPORTANT for path-based preview (/pr/<N>/...):
    // CRA builds with PUBLIC_URL=/pr/<N>, so we use it as router basename.
    const basename = process.env.PUBLIC_URL || '/';

    return (
        <Router basename={basename}>
            {/* Conditionally render the NavBar if authenticated */}
            {isAuthenticated && <NavBar userRole={userRole} onLogout={handleLogout} />}

            <Routes>
                {/* ======== Login Route ======== */}
                <Route
                    path="/login"
                    element={
                        <Login
                            setUserRole={setUserRole}
                            setIsAuthenticated={setIsAuthenticated}
                            setUser={setUser}  // Pass the setter for the user object
                        />
                    }
                />

                {/* ======== Authenticated Area ======== */}
                {isAuthenticated ? (
                    <>
                        {/* Admin/Manager routes */}
                        <Route
                            path="/admin-dashboard"
                            element={
                                isAdminOrManager ? <AdminDashboard /> : <Navigate to="/employee-dashboard" />
                            }
                        />
                        <Route
                            path="/user-management"
                            element={
                                isAdminOrManager ? <UserManagementPage /> : <Navigate to="/employee-dashboard" />
                            }
                        />
                        <Route
                            path="/employee-schedule-list"
                            element={
                                isAdminOrManager ? <EmployeeScheduleList /> : <Navigate to="/employee-dashboard" />
                            }
                        />
                        <Route
                            path="/employee-schedule-list/employee-skills-report"
                            element={
                                isAdminOrManager ? <EmployeeSkillsReport /> : <Navigate to="/employee-dashboard" />
                            }
                        />
                        <Route
                            path="/notes"
                            element={
                                isAdminOrManager ? <NotesPage /> : <Navigate to="/employee-dashboard" />
                            }
                        />
                        <Route
                            path="/schedule-detail/:weekCode/:dayIdx/:hourIdx"
                            element={
                                isAdminOrManager ? <ScheduleDetail /> : <Navigate to="/employee-dashboard" />
                            }
                        />
                        <Route
                            path="/blocker"
                            element={
                                isAdminOrManager ? <BlockerManagementPage /> : <Navigate to="/employee-dashboard" />
                            }
                        />
                        <Route
                            path="/schedule-communication"
                            element={
                                isAdminOrManager ? <ScheduleCommunication /> : <Navigate to="/employee-dashboard" />
                            }
                        />

                        {/* Employee Dashboard */}
                        <Route
                            path="/employee-dashboard"
                            element={
                                userRole === 'Employee'
                                    ? <EmployeeDashboard user={user} />
                                    : <Navigate to="/admin-dashboard" />
                            }
                        />

                        {/* Fallback => redirect based on role */}
                        <Route
                            path="*"
                            element={
                                <Navigate
                                    to={isAdminOrManager ? '/admin-dashboard' : '/employee-dashboard'}
                                />
                            }
                        />
                    </>
                ) : (
                    // If not authenticated => always redirect to /login
                    <Route path="*" element={<Navigate to="/login" />} />
                )}
            </Routes>
        </Router>
    );
}

export default App;
