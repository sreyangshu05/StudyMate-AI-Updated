import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { User, LogOut, Trash2, Download, KeyRound, Save, Loader } from 'lucide-react';
import { exportAPI, accountAPI, authAPI } from '../services/api';
import toast from 'react-hot-toast';

const Settings = () => {
  const { user, login, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [busy, setBusy] = useState(false);

  // Profile edit
  const [name, setName] = useState(user?.name || '');
  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNew, setConfirmNew] = useState('');

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to sign out?')) logout();
  };

  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 100) {
      return toast.error('Name must be 2-100 characters');
    }
    setBusy(true);
    try {
      const res = await authAPI.updateProfile(trimmed);
      login({ ...user, name: res.data.data.user.name });
      toast.success('Profile updated');
    } catch (e) {
      toast.error(e.response?.data?.error?.message || 'Could not update profile');
    } finally {
      setBusy(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) return toast.error('New password must be at least 8 characters');
    if (!/[a-zA-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
      return toast.error('New password must contain a letter and a number');
    }
    if (newPassword !== confirmNew) return toast.error('New password and confirmation do not match');
    setBusy(true);
    try {
      await authAPI.changePassword(currentPassword, newPassword);
      setCurrentPassword(''); setNewPassword(''); setConfirmNew('');
      toast.success('Password changed');
    } catch (e) {
      toast.error(e.response?.data?.error?.message || 'Password change failed');
    } finally {
      setBusy(false);
    }
  };

  const handleExportData = async () => {
    setBusy(true);
    try {
      const data = await exportAPI.downloadJson();
      // Wrap in the canonical envelope used by the backend.
      const payload = data.success ? data.data : data;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'studymate-export.json';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Your data export downloaded');
    } catch (e) {
      toast.error('Export failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm('This permanently deletes your account and ALL your data. This cannot be undone. Continue?')) {
      return;
    }
    if (!window.confirm('Final confirmation: are you absolutely sure you want to delete your account and all data?')) {
      return;
    }
    setBusy(true);
    try {
      await accountAPI.delete();
      toast.success('Account deleted. Thank you for using StudyMate.');
      logout(); // clears tokens and redirects to login
    } catch (e) {
      toast.error(e.response?.data?.error?.message || 'Account deletion failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: KeyRound },
    { id: 'data', label: 'Data & Privacy', icon: Download },
    { id: 'account', label: 'Account', icon: LogOut },
  ];

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600">Manage your account, security, and data</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <nav className="lg:col-span-1 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                  activeTab === tab.id ? 'bg-blue-100 text-blue-900' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon className="h-4 w-4 mr-3" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="lg:col-span-3">
          <div className="bg-white rounded-lg shadow">
            {activeTab === 'profile' && (
              <div className="p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-6">Profile Information</h3>
                <div className="space-y-6 max-w-lg">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                    <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                    <input className={`${inputCls} bg-gray-50 text-gray-500`} value={user?.email || ''} disabled />
                    <p className="text-xs text-gray-500 mt-1">Email cannot be changed (used for sign-in).</p>
                  </div>
                  <button
                    onClick={handleSaveName}
                    disabled={busy}
                    className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {busy ? <Loader className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Save Name
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-6">Change Password</h3>
                <div className="space-y-6 max-w-lg">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Current Password</label>
                    <input type="password" className={inputCls} value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">New Password</label>
                    <input type="password" className={inputCls} value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
                    <p className="text-xs text-gray-500 mt-1">At least 8 characters, include a letter and a number.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Confirm New Password</label>
                    <input type="password" className={inputCls} value={confirmNew}
                      onChange={(e) => setConfirmNew(e.target.value)} autoComplete="new-password" />
                  </div>
                  <button
                    onClick={handleChangePassword}
                    disabled={busy}
                    className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {busy ? <Loader className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
                    Change Password
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'data' && (
              <div className="p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-6">Data & Privacy</h3>
                <div className="space-y-6">
                  <div className="border border-gray-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h4 className="font-medium text-gray-900">Export Your Data</h4>
                      <p className="text-sm text-gray-500">
                        Download a JSON file with all your documents, quizzes, attempts, chats, and stats.
                      </p>
                    </div>
                    <button
                      onClick={handleExportData}
                      disabled={busy}
                      className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export Data
                    </button>
                  </div>

                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-gray-900">Data Storage</h4>
                        <p className="text-sm text-gray-500">Your data is stored securely; authentication is required for every request.</p>
                      </div>
                      <span className="text-sm text-green-600 font-medium">Secure</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'account' && (
              <div className="p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-6">Account Actions</h3>
                <div className="space-y-6">
                  <div className="border border-red-200 rounded-lg p-4 bg-red-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h4 className="font-medium text-red-900">Sign Out</h4>
                      <p className="text-sm text-red-700">Sign out of your account on this device.</p>
                    </div>
                    <button onClick={handleLogout} className="flex items-center justify-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
                      <LogOut className="h-4 w-4 mr-2" />
                      Sign Out
                    </button>
                  </div>

                  <div className="border border-red-300 rounded-lg p-4 bg-red-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h4 className="font-medium text-red-900">Delete Account</h4>
                      <p className="text-sm text-red-700">
                        Permanently deletes your account and all associated data. This cannot be undone.
                      </p>
                    </div>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={busy}
                      className="flex items-center justify-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Account
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
