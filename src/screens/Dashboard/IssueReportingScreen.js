import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, KeyboardAvoidingView, Platform, FlatList, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Input, TextArea, Picker, Card } from '../../components/ui';
import { ArrowLeft, Send, Clock, CheckCircle, AlertCircle } from 'lucide-react-native';
import { auth, db } from '../../services/firebaseConfig';
import { ref, get } from 'firebase/database';
import { submitIssue, ISSUE_CATEGORIES, subscribeToUserIssues } from '../../services/issueService';
import * as Location from 'expo-location';

export default function IssueReportingScreen({ navigation }) {
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        category: '',
        subject: '',
        description: ''
    });
    const [errors, setErrors] = useState({});

    // New state for issue history
    const [viewMode, setViewMode] = useState('report'); // 'report' | 'list' | 'detail'
    const [issues, setIssues] = useState([]);
    const [selectedIssue, setSelectedIssue] = useState(null);

    useEffect(() => {
        loadUserData();
    }, []);

    // Handle initial view from navigation params (for deep linking)
    useEffect(() => {
        const params = navigation.getState().routes.find(r => r.name === 'IssueReporting')?.params;
        if (params?.initialView) {
            setViewMode(params.initialView);
            if (params.issueId && issues.length > 0) {
                const issue = issues.find(i => i.id === params.issueId);
                if (issue) {
                    setSelectedIssue(issue);
                }
            }
        }
    }, [navigation, issues]);

    const loadUserData = async () => {
        const user = auth.currentUser;
        if (user) {
            try {
                const snapshot = await get(ref(db, `users/${user.uid}`));
                if (snapshot.exists()) {
                    setUserData(snapshot.val());
                }
            } catch (error) {
                console.error('[IssueReportingScreen] Error loading user data:', error);
            }
        }
    };

    // Subscribe to user's issues
    useEffect(() => {
        let unsubscribe = () => { };

        if (userData && userData.uid) {
            unsubscribe = subscribeToUserIssues(userData.uid, (issuesData) => {
                setIssues(issuesData);
            });
        }

        return () => unsubscribe();
    }, [userData]);

    const validateForm = () => {
        const newErrors = {};

        if (!formData.category) {
            newErrors.category = 'Please select a category';
        }

        if (!formData.subject.trim()) {
            newErrors.subject = 'Subject is required';
        } else if (formData.subject.trim().length > 100) {
            newErrors.subject = 'Subject must be less than 100 characters';
        }

        if (!formData.description.trim()) {
            newErrors.description = 'Description is required';
        } else if (formData.description.trim().length < 10) {
            newErrors.description = 'Description must be at least 10 characters';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async () => {
        if (!validateForm()) {
            Alert.alert('Validation Error', 'Please fill in all required fields correctly.');
            return;
        }

        if (!userData) {
            Alert.alert('Error', 'Unable to load user data. Please try again.');
            return;
        }

        setLoading(true);
        try {
            // Silently fetch location for the ISSUE_CREATED log
            let issueLocation = null;
            try {
                const { status } = await Location.getForegroundPermissionsAsync();
                if (status === 'granted') {
                    const loc = await Location.getCurrentPositionAsync({
                        accuracy: Location.Accuracy.Balanced,
                        timeout: 5000,
                    });
                    issueLocation = {
                        latitude: loc.coords.latitude,
                        longitude: loc.coords.longitude,
                        accuracy: loc.coords.accuracy
                    };
                }
            } catch (locErr) {
                // Silent - location is optional for the log
            }

            const issueId = await submitIssue(userData, formData, issueLocation);

            Alert.alert(
                'Success',
                'Your issue has been submitted successfully. Our team will review it shortly.',
                [
                    {
                        text: 'OK',
                        onPress: () => navigation.goBack()
                    }
                ]
            );

            // Reset form
            setFormData({
                category: '',
                subject: '',
                description: ''
            });
            setErrors({});
        } catch (error) {
            console.error('[IssueReportingScreen] Error submitting issue:', error);
            Alert.alert(
                'Submission Failed',
                'Unable to submit your issue. Please check your connection and try again.'
            );
        } finally {
            setLoading(false);
        }
    };

    // Helper function to get status badge styling
    const getStatusBadge = (status) => {
        switch (status) {
            case 'pending':
                return { label: 'Pending', color: '#F59E0B', bg: '#FEF3C7', icon: <Clock size={14} color="#F59E0B" /> };
            case 'in_progress':
                return { label: 'In Progress', color: '#3B82F6', bg: '#DBEAFE', icon: <AlertCircle size={14} color="#3B82F6" /> };
            case 'resolved':
                return { label: 'Resolved', color: '#10B981', bg: '#D1FAE5', icon: <CheckCircle size={14} color="#10B981" /> };
            default:
                return { label: 'Unknown', color: '#6B7280', bg: '#F3F4F6', icon: <Clock size={14} color="#6B7280" /> };
        }
    };

    // Render issue card for the list
    const renderIssueCard = ({ item }) => {
        const statusBadge = getStatusBadge(item.status);
        const date = new Date(item.updatedAt || item.createdAt);
        const formattedDate = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        return (
            <TouchableOpacity
                style={styles.issueCard}
                onPress={() => {
                    setSelectedIssue(item);
                    setViewMode('detail');
                }}
                activeOpacity={0.7}
            >
                <View style={styles.issueCardHeader}>
                    <Text style={styles.issueSubject} numberOfLines={1}>{item.subject}</Text>
                    <View style={[styles.statusBadge2, { backgroundColor: statusBadge.bg }]}>
                        {statusBadge.icon}
                        <Text style={[styles.statusBadgeText2, { color: statusBadge.color }]}>
                            {statusBadge.label}
                        </Text>
                    </View>
                </View>
                <Text style={styles.issueCategory}>{ISSUE_CATEGORIES.find(c => c.value === item.category)?.label || item.category}</Text>
                <Text style={styles.issueDate}>{formattedDate}</Text>
            </TouchableOpacity>
        );
    };

    // Render issue detail modal
    const renderIssueDetail = () => {
        if (!selectedIssue) return null;

        const statusBadge = getStatusBadge(selectedIssue.status);
        const createdDate = new Date(selectedIssue.createdAt);
        const updatedDate = selectedIssue.updatedAt ? new Date(selectedIssue.updatedAt) : null;

        return (
            <Modal
                visible={viewMode === 'detail'}
                animationType="slide"
                onRequestClose={() => setViewMode('list')}
            >
                <SafeAreaView style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <TouchableOpacity onPress={() => setViewMode('list')} style={styles.backButton}>
                            <ArrowLeft size={24} color="#1f2937" />
                        </TouchableOpacity>
                        <View style={styles.headerTextContainer}>
                            <Text style={styles.modalHeaderTitle}>Issue Details</Text>
                        </View>
                    </View>

                    <ScrollView style={styles.modalContent}>
                        <Card style={styles.detailCard}>
                            {/* Status Badge */}
                            <View style={[styles.statusBadgeLarge, { backgroundColor: statusBadge.bg }]}>
                                {statusBadge.icon}
                                <Text style={[styles.statusBadgeTextLarge, { color: statusBadge.color }]}>
                                    {statusBadge.label}
                                </Text>
                            </View>

                            {/* Subject */}
                            <Text style={styles.detailSubject}>{selectedIssue.subject}</Text>

                            {/* Category & Date */}
                            <Text style={styles.detailMeta}>
                                Category: {ISSUE_CATEGORIES.find(c => c.value === selectedIssue.category)?.label || selectedIssue.category}
                            </Text>
                            <Text style={styles.detailMeta}>
                                Submitted: {createdDate.toLocaleDateString('en-US', {
                                    month: 'long',
                                    day: 'numeric',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}
                            </Text>

                            {/* Description */}
                            <View style={styles.sectionDivider} />
                            <Text style={styles.sectionTitle}>Your Issue</Text>
                            <Text style={styles.detailDescription}>{selectedIssue.description}</Text>

                            {/* Admin Reply Section */}
                            {selectedIssue.adminReply && (
                                <>
                                    <View style={styles.sectionDivider} />
                                    <Text style={styles.sectionTitle}>Admin Response</Text>
                                    <View style={styles.adminReplyCard}>
                                        <Text style={styles.adminReplyText}>{selectedIssue.adminReply}</Text>
                                        {updatedDate && (
                                            <Text style={styles.adminReplyDate}>
                                                {updatedDate.toLocaleDateString('en-US', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </Text>
                                        )}
                                    </View>
                                </>
                            )}
                        </Card>
                    </ScrollView>
                </SafeAreaView>
            </Modal>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <ArrowLeft size={24} color="#1f2937" />
                </TouchableOpacity>
                <View style={styles.headerTextContainer}>
                    <Text style={styles.headerTitle}>Issue Centre</Text>
                    <Text style={styles.headerSubtitle}>We're here to help</Text>
                </View>
            </View>

            {/* Tab Navigation */}
            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={[styles.tab, viewMode === 'report' && styles.tabActive]}
                    onPress={() => setViewMode('report')}
                    activeOpacity={0.7}
                >
                    <Text style={[styles.tabText, viewMode === 'report' && styles.tabTextActive]}>
                        Report Issue
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, viewMode === 'list' && styles.tabActive]}
                    onPress={() => setViewMode('list')}
                    activeOpacity={0.7}
                >
                    <Text style={[styles.tabText, viewMode === 'list' && styles.tabTextActive]}>
                        My Issues ({issues.length})
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Report Form View */}
            {viewMode === 'report' && (
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                >
                    <ScrollView
                        contentContainerStyle={styles.scrollContent}
                        keyboardShouldPersistTaps="handled"
                    >
                        <Card style={styles.formCard}>
                            <Text style={styles.formTitle}>What can we help you with?</Text>
                            <Text style={styles.formSubtitle}>
                                Please provide details about your issue and we'll get back to you as soon as possible.
                            </Text>

                            {/* Category Selection */}
                            <Picker
                                label="Category *"
                                value={formData.category}
                                options={ISSUE_CATEGORIES}
                                onValueChange={(value) => {
                                    setFormData({ ...formData, category: value });
                                    setErrors({ ...errors, category: '' });
                                }}
                                error={errors.category}
                                placeholder="Select a category"
                            />

                            {/* Subject Input */}
                            <Input
                                label="Subject *"
                                placeholder="Brief summary of your issue"
                                value={formData.subject}
                                onChangeText={(text) => {
                                    setFormData({ ...formData, subject: text });
                                    setErrors({ ...errors, subject: '' });
                                }}
                                error={errors.subject}
                                maxLength={100}
                            />

                            {/* Description TextArea */}
                            <TextArea
                                label="Description *"
                                placeholder="Please describe your issue in detail..."
                                value={formData.description}
                                onChangeText={(text) => {
                                    setFormData({ ...formData, description: text });
                                    setErrors({ ...errors, description: '' });
                                }}
                                error={errors.description}
                                maxLength={500}
                            />

                            {/* User Info Display */}
                            {userData && (
                                <View style={styles.userInfoCard}>
                                    <Text style={styles.userInfoLabel}>Submitting as:</Text>
                                    <Text style={styles.userInfoText}>{userData.name}</Text>
                                    <Text style={styles.userInfoSubtext}>{userData.email}</Text>
                                    {userData.branch && (
                                        <Text style={styles.userInfoSubtext}>Branch: {userData.branch}</Text>
                                    )}
                                </View>
                            )}

                            {/* Submit Button */}
                            <Button
                                title="Submit Issue"
                                onPress={handleSubmit}
                                loading={loading}
                                icon={<Send size={18} color="white" />}
                            />

                            <Text style={styles.footerNote}>
                                * Required fields. Your issue will be reviewed by our support team.
                            </Text>
                        </Card>
                    </ScrollView>
                </KeyboardAvoidingView>
            )}

            {/* Issue List View */}
            {viewMode === 'list' && (
                <View style={{ flex: 1, backgroundColor: '#f3f4f6' }}>
                    {issues.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyStateTitle}>No Issues Yet</Text>
                            <Text style={styles.emptyStateText}>
                                You haven't submitted any issues. Tap "Report Issue" to get started.
                            </Text>
                        </View>
                    ) : (
                        <FlatList
                            data={issues}
                            renderItem={renderIssueCard}
                            keyExtractor={(item) => item.id}
                            contentContainerStyle={styles.listContent}
                        />
                    )}
                </View>
            )}

            {/* Issue Detail Modal */}
            {renderIssueDetail()}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f3f4f6',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    backButton: {
        padding: 8,
        marginRight: 8,
    },
    headerTextContainer: {
        flex: 1,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#1f2937',
    },
    headerSubtitle: {
        fontSize: 14,
        color: '#6b7280',
        marginTop: 2,
    },
    scrollContent: {
        padding: 16,
    },
    formCard: {
        marginVertical: 0,
    },
    formTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1f2937',
        marginBottom: 8,
    },
    formSubtitle: {
        fontSize: 14,
        color: '#6b7280',
        marginBottom: 24,
        lineHeight: 20,
    },
    userInfoCard: {
        backgroundColor: '#f9fafb',
        padding: 16,
        borderRadius: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    userInfoLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#6b7280',
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    userInfoText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1f2937',
        marginBottom: 4,
    },
    userInfoSubtext: {
        fontSize: 14,
        color: '#6b7280',
        marginBottom: 2,
    },
    footerNote: {
        fontSize: 12,
        color: '#9ca3af',
        textAlign: 'center',
        marginTop: 8,
        fontStyle: 'italic',
    },
    // Tab Navigation
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: '#ffffff',
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    tab: {
        flex: 1,
        paddingVertical: 16,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabActive: {
        borderBottomColor: '#b91c1c',
    },
    tabText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6b7280',
    },
    tabTextActive: {
        color: '#b91c1c',
    },
    // Issue List
    listContent: {
        padding: 16,
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    emptyStateTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1f2937',
        marginBottom: 8,
    },
    emptyStateText: {
        fontSize: 14,
        color: '#6b7280',
        textAlign: 'center',
        lineHeight: 20,
    },
    issueCard: {
        backgroundColor: '#ffffff',
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    issueCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
        gap: 8,
    },
    issueSubject: {
        flex: 1,
        fontSize: 16,
        fontWeight: '600',
        color: '#1f2937',
    },
    issueCategory: {
        fontSize: 13,
        color: '#6b7280',
        marginBottom: 4,
    },
    issueDate: {
        fontSize: 12,
        color: '#9ca3af',
    },
    statusBadge2: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        gap: 4,
    },
    statusBadgeText2: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    // Detail Modal
    modalContainer: {
        flex: 1,
        backgroundColor: '#f3f4f6',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    modalHeaderTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1f2937',
    },
    modalContent: {
        flex: 1,
        padding: 16,
    },
    detailCard: {
        marginVertical: 0,
    },
    statusBadgeLarge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        marginBottom: 16,
        gap: 6,
    },
    statusBadgeTextLarge: {
        fontSize: 13,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    detailSubject: {
        fontSize: 20,
        fontWeight: '700',
        color: '#1f2937',
        marginBottom: 12,
    },
    detailMeta: {
        fontSize: 13,
        color: '#6b7280',
        marginBottom: 6,
    },
    sectionDivider: {
        height: 1,
        backgroundColor: '#e5e7eb',
        marginVertical: 16,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1f2937',
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    detailDescription: {
        fontSize: 15,
        color: '#374151',
        lineHeight: 22,
    },
    adminReplyCard: {
        backgroundColor: '#eff6ff',
        padding: 16,
        borderRadius: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#3b82f6',
    },
    adminReplyText: {
        fontSize: 15,
        color: '#1f2937',
        lineHeight: 22,
        marginBottom: 8,
    },
    adminReplyDate: {
        fontSize: 12,
        color: '#6b7280',
        fontStyle: 'italic',
    }
});
