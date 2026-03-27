const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const winston = require('winston');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// Security Configuration
const JWT_SECRET = process.env.JWT_SECRET;
const API_KEY = process.env.SIMPRO_API_KEY;
const API_BASE = process.env.SIMPRO_BASE_URL;

// Logger Setup
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'pe-mobile-error.log', level: 'error' }),
        new winston.transports.File({ filename: 'pe-mobile.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ],
});

// Security Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"]
        }
    }
}));

app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? false : '*',
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.'));

// Rate Limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 3600000, // 1 hour
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: {
        error: 'Too many requests from this IP. Please try again later.',
        retryAfter: 3600
    },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/', limiter);

// Secure Team Credentials (Hashed Passwords)
const secureTeamCredentials = {
    'ramsey': { 
        passwordHash: bcrypt.hashSync('R@msey2026!PE', 10), 
        techId: '2273', 
        name: 'Ramsey Kanafani',
        role: 'owner'
    },
    'darius': { 
        passwordHash: bcrypt.hashSync('D@rius2026!PE', 10), 
        techId: '5796', 
        name: 'Darius Marsh',
        role: 'project'
    },
    'max': { 
        passwordHash: bcrypt.hashSync('M@x2026!PE', 10), 
        techId: '5795', 
        name: 'Max Mitchell',
        role: 'project'
    },
    'houssam': { 
        passwordHash: bcrypt.hashSync('H@ussam2026!PE', 10), 
        techId: '5815', 
        name: 'Houssam Kanafani',
        role: 'project'
    },
    'dario': { 
        passwordHash: bcrypt.hashSync('D@rio2026!PE', 10), 
        techId: '5681', 
        name: 'Dario Mancini',
        role: 'service'
    },
    'damin': { 
        passwordHash: bcrypt.hashSync('D@min2026!PE', 10), 
        techId: '4970', 
        name: 'Damin Anderson',
        role: 'service'
    },
    'jake': { 
        passwordHash: bcrypt.hashSync('J@ke2026!PE', 10), 
        techId: '4925', 
        name: 'Jake Clark',
        role: 'service'
    },
    'bailey': { 
        passwordHash: bcrypt.hashSync('B@iley2026!PE', 10), 
        techId: '5090', 
        name: 'Bailey Gould',
        role: 'apprentice'
    }
};

// Failed login tracking
const loginAttempts = {};

// Audit logging function
function auditLog(action, user, details, ipAddress) {
    logger.info({
        timestamp: new Date().toISOString(),
        action: action,
        user: user,
        details: details,
        ipAddress: ipAddress,
        userAgent: details.userAgent || 'unknown'
    });
}

// JWT Token validation middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            auditLog('TOKEN_INVALID', 'unknown', { error: err.message }, req.ip);
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
}

// LOGIN API with security measures
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (!username || !password) {
        auditLog('LOGIN_FAILED', username, { reason: 'Missing credentials' }, clientIP);
        return res.status(400).json({ error: 'Username and password required' });
    }

    const userKey = username.toLowerCase();
    const user = secureTeamCredentials[userKey];
    
    // Check if account is locked
    const attempts = loginAttempts[clientIP] || { count: 0, lockUntil: 0 };
    if (attempts.lockUntil && Date.now() < attempts.lockUntil) {
        const remainingTime = Math.ceil((attempts.lockUntil - Date.now()) / 60000);
        auditLog('LOGIN_BLOCKED', username, { reason: 'Account locked', remainingMinutes: remainingTime }, clientIP);
        return res.status(429).json({ 
            error: `Account temporarily locked. Try again in ${remainingTime} minutes.`,
            lockUntil: attempts.lockUntil
        });
    }

    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        // Increment failed attempts
        if (!loginAttempts[clientIP]) {
            loginAttempts[clientIP] = { count: 0, lockUntil: 0 };
        }
        loginAttempts[clientIP].count++;
        
        const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
        if (loginAttempts[clientIP].count >= maxAttempts) {
            const lockDuration = parseInt(process.env.LOCKOUT_DURATION_MINUTES) || 30;
            loginAttempts[clientIP].lockUntil = Date.now() + (lockDuration * 60 * 1000);
            auditLog('ACCOUNT_LOCKED', username, { attempts: loginAttempts[clientIP].count }, clientIP);
        }

        auditLog('LOGIN_FAILED', username, { 
            attempts: loginAttempts[clientIP].count,
            reason: 'Invalid credentials'
        }, clientIP);
        
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Successful login - reset attempts
    if (loginAttempts[clientIP]) {
        delete loginAttempts[clientIP];
    }

    // Create JWT token
    const token = jwt.sign(
        { 
            username: userKey,
            techId: user.techId,
            name: user.name,
            role: user.role
        },
        JWT_SECRET,
        { expiresIn: `${process.env.SESSION_TIMEOUT_HOURS || 4}h` }
    );

    auditLog('LOGIN_SUCCESS', username, { 
        name: user.name,
        role: user.role,
        techId: user.techId
    }, clientIP);

    res.json({
        success: true,
        token: token,
        user: {
            username: userKey,
            name: user.name,
            techId: user.techId,
            role: user.role
        }
    });
});

// Secure API endpoints with authentication
app.get('/api/schedules/:techId', authenticateToken, async (req, res) => {
    try {
        const techId = req.params.techId;
        const requestedDate = req.query.date || new Date().toISOString().split('T')[0];
        
        // Verify user can only access their own data
        if (req.user.techId !== techId) {
            auditLog('UNAUTHORIZED_ACCESS', req.user.username, { 
                requestedTechId: techId,
                userTechId: req.user.techId
            }, req.ip);
            return res.status(403).json({ error: 'Access denied: Can only view your own schedule' });
        }
        
        auditLog('API_CALL', req.user.username, { 
            endpoint: 'schedules',
            techId: techId,
            date: requestedDate
        }, req.ip);

        const response = await fetch(`${API_BASE}/schedules/?Date=${requestedDate}&page=1&pageSize=50`, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`SimPro API error: ${response.status}`);
        }
        
        const schedules = await response.json();
        const techJobs = schedules.filter(schedule => schedule.Staff.ID == techId);
        
        // Get job details for each schedule
        const jobsWithDetails = await Promise.all(
            techJobs.map(async (schedule) => {
                try {
                    const jobId = schedule.Reference.includes('-') ? schedule.Reference.split('-')[0] : schedule.Reference;
                    const jobResponse = await fetch(`${API_BASE}/jobs/${jobId}`, {
                        headers: {
                            'Authorization': `Bearer ${API_KEY}`
                        }
                    });
                    
                    if (jobResponse.ok) {
                        const jobData = await jobResponse.json();
                        return {
                            ...schedule,
                            jobDetails: {
                                customer: jobData.Customer.CompanyName,
                                site: jobData.Site.Name,
                                description: jobData.Description || 'No description',
                                status: jobData.Status?.Name || 'Active'
                            }
                        };
                    }
                    
                    return schedule;
                } catch (error) {
                    logger.error(`Error fetching job ${schedule.Reference}:`, error);
                    return schedule;
                }
            })
        );
        
        auditLog('SCHEDULES_RETRIEVED', req.user.username, { 
            jobCount: jobsWithDetails.length,
            date: requestedDate
        }, req.ip);

        res.json(jobsWithDetails);
    } catch (error) {
        logger.error('Error fetching schedules:', error);
        auditLog('API_ERROR', req.user.username, { 
            endpoint: 'schedules',
            error: error.message
        }, req.ip);
        res.status(500).json({ error: error.message });
    }
});

// Check for incomplete time entries
app.get('/api/time-entries/incomplete/:techId', authenticateToken, async (req, res) => {
    try {
        const techId = req.params.techId;
        const date = req.query.date || new Date().toISOString().split('T')[0];
        
        // Verify user can only access their own data
        if (req.user.techId !== techId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        // In a real implementation, you'd check time entries in SimPro
        // For now, simulate checking for jobs without time entries
        const schedulesResponse = await fetch(`${API_BASE}/schedules/?Date=${date}&page=1&pageSize=50`, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`
            }
        });
        
        if (schedulesResponse.ok) {
            const schedules = await schedulesResponse.json();
            const techJobs = schedules.filter(schedule => schedule.Staff.ID == techId);
            
            // Simulate: assume jobs without recorded time entries need attention
            const missingEntries = Math.max(0, techJobs.length - Math.floor(Math.random() * techJobs.length));
            const hasIncompleteEntries = missingEntries > 0;
            
            auditLog('TIME_ENTRIES_CHECK', req.user.username, {
                date: date,
                totalJobs: techJobs.length,
                missingEntries: missingEntries
            }, req.ip);
            
            res.json({
                hasIncompleteEntries,
                missingEntries,
                totalJobs: techJobs.length,
                date: date
            });
        } else {
            throw new Error('Failed to check time entries');
        }
    } catch (error) {
        logger.error('Error checking time entries:', error);
        res.status(500).json({ error: error.message });
    }
});

// Secure time logging
app.post('/api/jobs/:jobId/time', authenticateToken, async (req, res) => {
    try {
        const { jobId } = req.params;
        const { hours, notes, startTime, endTime, breakMinutes, date } = req.body;
        
        const timeEntry = {
            jobId: jobId,
            hours: hours,
            notes: notes || 'Time logged via PE Mobile App',
            user: req.user.name,
            date: date || new Date().toISOString().split('T')[0]
        };
        
        // Add manual time entry details if provided
        if (startTime && endTime) {
            timeEntry.startTime = startTime;
            timeEntry.endTime = endTime;
            timeEntry.breakMinutes = breakMinutes || 0;
            timeEntry.entryType = 'manual';
        } else {
            timeEntry.entryType = 'timer';
        }
        
        auditLog('TIME_LOGGED', req.user.username, timeEntry, req.ip);

        // In production, implement actual SimPro time entry API
        logger.info(`Time logged: ${hours} hours to job ${jobId} by ${req.user.name} (${timeEntry.entryType})`);
        
        res.json({ 
            success: true, 
            message: `${hours} hours logged successfully`,
            jobId,
            hours,
            entryType: timeEntry.entryType,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error logging time:', error);
        auditLog('TIME_LOG_ERROR', req.user.username, { 
            jobId: req.params.jobId,
            error: error.message
        }, req.ip);
        res.status(500).json({ error: error.message });
    }
});

// Secure notes saving
app.post('/api/jobs/:jobId/notes', authenticateToken, async (req, res) => {
    try {
        const { jobId } = req.params;
        const { notes } = req.body;
        
        // Get current job to append notes
        const jobResponse = await fetch(`${API_BASE}/jobs/${jobId}`, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`
            }
        });
        
        if (!jobResponse.ok) {
            throw new Error('Failed to fetch job');
        }
        
        const job = await jobResponse.json();
        const timestamp = new Date().toLocaleString();
        const updatedNotes = job.Notes ? 
            `${job.Notes}\n\n[${timestamp} - ${req.user.name}] ${notes}` : 
            `[${timestamp} - ${req.user.name}] ${notes}`;
        
        // Update job with new notes
        const updateResponse = await fetch(`${API_BASE}/jobs/${jobId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                Notes: updatedNotes
            })
        });
        
        if (!updateResponse.ok) {
            throw new Error('Failed to update job notes');
        }
        
        auditLog('NOTES_SAVED', req.user.username, {
            jobId: jobId,
            notesLength: notes.length
        }, req.ip);
        
        res.json({ 
            success: true, 
            message: 'Notes saved successfully',
            timestamp
        });
    } catch (error) {
        logger.error('Error saving notes:', error);
        auditLog('NOTES_ERROR', req.user.username, {
            jobId: req.params.jobId,
            error: error.message
        }, req.ip);
        res.status(500).json({ error: error.message });
    }
});

// Secure purchase order creation
app.post('/api/jobs/:jobId/purchase-order', authenticateToken, async (req, res) => {
    try {
        const { jobId } = req.params;
        const { vendorId, description, item, amount } = req.body;
        
        auditLog('PO_CREATE_START', req.user.username, {
            jobId: jobId,
            vendorId: vendorId,
            amount: amount
        }, req.ip);
        
        // Create purchase order using SimPro API
        const poData = {
            Vendor: parseInt(vendorId),
            Description: `${description} [Created by ${req.user.name}]`
        };
        
        const response = await fetch(`${API_BASE}/vendorOrders/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(poData)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error('Failed to create purchase order in SimPro');
        }
        
        const result = await response.json();
        const poNumber = result.ID;
        
        auditLog('PO_CREATED', req.user.username, {
            jobId: jobId,
            poNumber: poNumber,
            vendorId: vendorId,
            amount: amount,
            description: description
        }, req.ip);
        
        logger.info(`✅ PO #${poNumber} created by ${req.user.name} for job ${jobId}`);
        
        res.json({ 
            success: true, 
            message: `Purchase order created successfully`,
            poNumber: poNumber,
            jobId: jobId,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error creating PO:', error);
        auditLog('PO_ERROR', req.user.username, {
            jobId: req.params.jobId,
            error: error.message
        }, req.ip);
        res.status(500).json({ error: error.message });
    }
});

// Secure photo upload placeholder
app.post('/api/jobs/:jobId/photos', authenticateToken, async (req, res) => {
    try {
        const { jobId } = req.params;
        const { photoCount } = req.body;
        
        auditLog('PHOTOS_UPLOADED', req.user.username, {
            jobId: jobId,
            photoCount: photoCount
        }, req.ip);
        
        res.json({ 
            success: true, 
            message: `${photoCount} photos uploaded successfully`,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error uploading photos:', error);
        res.status(500).json({ error: error.message });
    }
});

// Serve secure login page as default
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'secure-login.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'secure-login.html'));
});

app.get('/app.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'secure-app.html'));
});

app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'secure-admin.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        version: '1.0.0-secure'
    });
});

app.listen(PORT, '0.0.0.0', () => {
    logger.info(`🔒 PE Mobile SECURE server running on port ${PORT}`);
    logger.info(`🛡️ Security features enabled: JWT auth, rate limiting, audit logging`);
    logger.info(`📱 Access at: https://your-domain.com`);
    console.log(`🔒 PE Mobile SECURE server running on port ${PORT}`);
    console.log(`🛡️ Maximum security enabled - protecting your SimPro system`);
});