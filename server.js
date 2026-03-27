const express = require('express');
// Using built-in fetch (Node 18+)
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// SimPro API configuration
const API_BASE = 'https://pe.simprocloud.com/api/v1.0/companies/30';
const API_KEY = 'f39cd3808a81d8c567250636b6c98f9d88f3928b';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Get today's schedules for a technician
app.get('/api/schedules/:techId', async (req, res) => {
    try {
        const techId = req.params.techId;
        const today = new Date().toISOString().split('T')[0];
        
        const response = await fetch(`${API_BASE}/schedules/?Date=${today}&page=1&pageSize=50`, {
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
                    console.error(`Error fetching job ${schedule.Reference}:`, error);
                    return schedule;
                }
            })
        );
        
        res.json(jobsWithDetails);
    } catch (error) {
        console.error('Error fetching schedules:', error);
        res.status(500).json({ error: error.message });
    }
});

// Log time to a job (simplified - would need proper time entry API)
app.post('/api/jobs/:jobId/time', async (req, res) => {
    try {
        const { jobId } = req.params;
        const { hours, notes, techId } = req.body;
        
        console.log(`Logging ${hours} hours to job ${jobId} for tech ${techId}`);
        console.log(`Notes: ${notes}`);
        
        // For demo - we'll just log it. In production, you'd create actual time entries
        // const timeEntry = await createTimeEntry(jobId, techId, hours, notes);
        
        res.json({ 
            success: true, 
            message: `${hours} hours logged successfully`,
            jobId,
            hours,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error logging time:', error);
        res.status(500).json({ error: error.message });
    }
});

// Save notes to a job
app.post('/api/jobs/:jobId/notes', async (req, res) => {
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
            `${job.Notes}\n\n[${timestamp}] ${notes}` : 
            `[${timestamp}] ${notes}`;
        
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
        
        res.json({ 
            success: true, 
            message: 'Notes saved successfully',
            timestamp
        });
    } catch (error) {
        console.error('Error saving notes:', error);
        res.status(500).json({ error: error.message });
    }
});

// Upload photos (placeholder - SimPro photo API would be more complex)
app.post('/api/jobs/:jobId/photos', async (req, res) => {
    try {
        const { jobId } = req.params;
        const { photoCount } = req.body;
        
        console.log(`Uploading ${photoCount} photos to job ${jobId}`);
        
        // In production, you'd handle actual file uploads and use SimPro's attachment API
        
        res.json({ 
            success: true, 
            message: `${photoCount} photos uploaded successfully`,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error uploading photos:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create purchase order for job
app.post('/api/jobs/:jobId/purchase-order', async (req, res) => {
    try {
        const { jobId } = req.params;
        const { vendorId, description, item, amount } = req.body;
        
        console.log(`Creating PO for job ${jobId}: vendor=${vendorId}, item=${item}, amount=$${amount}`);
        
        // Create purchase order using SimPro API - correct format
        const poData = {
            Vendor: parseInt(vendorId), // Just the ID, not wrapped in object
            Description: description
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
            console.error('SimPro PO creation failed:', errorText);
            throw new Error('Failed to create purchase order in SimPro');
        }
        
        const result = await response.json();
        const poNumber = result.ID; // This should be the 4xxxxx format
        
        console.log(`✅ PO #${poNumber} created successfully`);
        
        res.json({ 
            success: true, 
            message: `Purchase order created successfully`,
            poNumber: poNumber,
            jobId: jobId,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error creating PO:', error);
        res.status(500).json({ error: error.message });
    }
});

// Serve login page as default
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Serve specific pages
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/app.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'app.html'));
});

app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ PE Mobile server running on http://localhost:${PORT}`);
    console.log(`📱 Access from any device on your network`);
    console.log(`🌐 Try these addresses on your phone:`);
    console.log(`   http://192.168.0.7:${PORT}/app.html`);
    console.log(`   http://192.168.1.7:${PORT}/app.html`);
    console.log(`   http://10.0.0.7:${PORT}/app.html`);
});