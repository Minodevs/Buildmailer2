const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// SMTP Config - Hardcoded for Alibaba DirectMail
const SMTP_CONFIG = {
    host: 'smtpdm-ap-southeast-1.aliyuncs.com',
    port: 465,
    secure: true,
    auth: {
        user: 'noreply@8dayscafe.com',
        pass: 'Kx94mP72nS'
    },
    tls: {
        rejectUnauthorized: false
    }
};

// Data directory
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Create transporter
const createTransporter = () => {
    return nodemailer.createTransport(SMTP_CONFIG);
};

// Unsubscribe footer template
const getUnsubscribeFooter = (email) => {
    return `
<hr style="margin: 30px 0; border: none; border-top: 1px solid #e0e0e0;">
<div style="text-align: center; color: #666; font-size: 12px; padding: 20px;">
  <p>If you no longer wish to receive these emails, you can <a href="https://mesajio.com/unsubscribe?email=${encodeURIComponent(email)}" style="color: #0066cc; text-decoration: underline;">unsubscribe here</a>.</p>
  <p style="margin-top: 10px;">© ${new Date().getFullYear()} Mesajio. All rights reserved.</p>
</div>`;
};

// Scheduled jobs storage
let scheduledJobs = [];
const jobsFile = path.join(dataDir, 'scheduled_jobs.json');

// Load scheduled jobs from file
const loadScheduledJobs = () => {
    try {
        if (fs.existsSync(jobsFile)) {
            const data = fs.readFileSync(jobsFile, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Error loading jobs:', err);
    }
    return [];
};

// Save scheduled jobs to file
const saveScheduledJobs = () => {
    try {
        fs.writeFileSync(jobsFile, JSON.stringify(scheduledJobs, null, 2));
    } catch (err) {
        console.error('Error saving jobs:', err);
    }
};

// Send email function
const sendEmail = async (to, fromName, subject, html) => {
    const transporter = createTransporter();
    const finalHtml = html + getUnsubscribeFooter(to);
    
    try {
        const info = await transporter.sendMail({
            from: `"${fromName || 'Esbet'}" <${SMTP_CONFIG.auth.user}>`,
            to: to,
            subject: subject,
            html: finalHtml
        });
        return { success: true, messageId: info.messageId };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

// Routes

// Bulk Email Sender (Ana Sayfa)
app.get('/', (req, res) => {
    res.render('index', { 
        smtpConfig: {
            host: SMTP_CONFIG.host,
            port: SMTP_CONFIG.port
        },
        scheduledJobs: scheduledJobs
    });
});

// API: Test SMTP connection
app.get('/api/test-smtp', async (req, res) => {
    const transporter = createTransporter();
    try {
        await transporter.verify();
        res.json({ 
            success: true, 
            message: 'SMTP connection successful',
            config: {
                host: SMTP_CONFIG.host,
                port: SMTP_CONFIG.port
            }
        });
    } catch (error) {
        res.json({ 
            success: false, 
            message: error.message
        });
    }
});

// API: Send single email
app.post('/api/send-email', async (req, res) => {
    console.log('[API] /api/send-email called');
    const { to, fromName, subject, html } = req.body;
    
    console.log('[API] To:', to);
    console.log('[API] FromName:', fromName);
    console.log('[API] Subject:', subject);
    
    if (!to || !subject || !html) {
        console.log('[API] Missing fields');
        return res.json({ success: false, error: 'Missing required fields' });
    }
    
    console.log('[API] Sending email...');
    const result = await sendEmail(to, fromName, subject, html);
    console.log('[API] Result:', result);
    res.json(result);
});

// API: Schedule a job
app.post('/api/schedule', (req, res) => {
    const { emails, fromName, subject, html, cronExpression, delay } = req.body;
    
    if (!emails || !subject || !html || !cronExpression) {
        return res.json({ success: false, error: 'Missing required fields' });
    }
    
    const jobId = Date.now().toString();
    const job = {
        id: jobId,
        emails: emails,
        fromName: fromName || 'Esbet',
        subject: subject,
        html: html,
        cronExpression: cronExpression,
        delay: delay || 2000,
        createdAt: new Date().toISOString(),
        status: 'active',
        lastRun: null,
        totalSent: 0,
        totalFailed: 0
    };
    
    // Create cron job
    const cronJob = cron.schedule(cronExpression, async () => {
        console.log(`[CRON] Running job ${jobId}`);
        job.lastRun = new Date().toISOString();
        
        const emailList = job.emails.split(/[\n,;]+/)
            .map(e => e.trim().toLowerCase())
            .filter(e => e.includes('@') && e.includes('.'));
        
        for (const email of emailList) {
            const result = await sendEmail(email, job.fromName, job.subject, job.html);
            if (result.success) {
                job.totalSent++;
            } else {
                job.totalFailed++;
            }
            if (job.delay > 0) {
                await new Promise(r => setTimeout(r, job.delay));
            }
        }
        
        saveScheduledJobs();
        console.log(`[CRON] Job ${jobId} completed. Sent: ${job.totalSent}, Failed: ${job.totalFailed}`);
    });
    
    job.cronJobRef = cronJob;
    scheduledJobs.push(job);
    saveScheduledJobs();
    
    res.json({ success: true, jobId: jobId, message: 'Job scheduled successfully' });
});

// API: Get scheduled jobs
app.get('/api/jobs', (req, res) => {
    const jobs = scheduledJobs.map(j => ({
        id: j.id,
        fromName: j.fromName,
        subject: j.subject,
        cronExpression: j.cronExpression,
        status: j.status,
        createdAt: j.createdAt,
        lastRun: j.lastRun,
        totalSent: j.totalSent,
        totalFailed: j.totalFailed,
        emailCount: j.emails.split(/[\n,;]+/).filter(e => e.includes('@')).length
    }));
    res.json({ success: true, jobs: jobs });
});

// API: Stop a job
app.post('/api/jobs/:id/stop', (req, res) => {
    const job = scheduledJobs.find(j => j.id === req.params.id);
    if (job && job.cronJobRef) {
        job.cronJobRef.stop();
        job.status = 'stopped';
        saveScheduledJobs();
        res.json({ success: true, message: 'Job stopped' });
    } else {
        res.json({ success: false, error: 'Job not found' });
    }
});

// API: Delete a job
app.delete('/api/jobs/:id', (req, res) => {
    const index = scheduledJobs.findIndex(j => j.id === req.params.id);
    if (index !== -1) {
        if (scheduledJobs[index].cronJobRef) {
            scheduledJobs[index].cronJobRef.stop();
        }
        scheduledJobs.splice(index, 1);
        saveScheduledJobs();
        res.json({ success: true, message: 'Job deleted' });
    } else {
        res.json({ success: false, error: 'Job not found' });
    }
});

// Restore cron jobs from saved data
const restoreJobs = () => {
    const savedJobs = loadScheduledJobs();
    
    for (const jobData of savedJobs) {
        if (jobData.status === 'active') {
            const cronJob = cron.schedule(jobData.cronExpression, async () => {
                console.log(`[CRON] Running job ${jobData.id}`);
                jobData.lastRun = new Date().toISOString();
                
                const emailList = jobData.emails.split(/[\n,;]+/)
                    .map(e => e.trim().toLowerCase())
                    .filter(e => e.includes('@') && e.includes('.'));
                
                for (const email of emailList) {
                    const result = await sendEmail(email, jobData.fromName, jobData.subject, jobData.html);
                    if (result.success) {
                        jobData.totalSent++;
                    } else {
                        jobData.totalFailed++;
                    }
                    if (jobData.delay > 0) {
                        await new Promise(r => setTimeout(r, jobData.delay));
                    }
                }
                
                saveScheduledJobs();
                console.log(`[CRON] Job ${jobData.id} completed. Sent: ${jobData.totalSent}, Failed: ${jobData.totalFailed}`);
            });
            
            jobData.cronJobRef = cronJob;
            scheduledJobs.push(jobData);
        }
    }
    
    return savedJobs.length;
};

// Start server
app.listen(PORT, () => {
    console.log(`Bulk Email Sender running on http://localhost:${PORT}`);
    console.log(`SMTP: ${SMTP_CONFIG.host}:${SMTP_CONFIG.port}`);
    
    // Restore saved cron jobs on startup
    const restoredCount = restoreJobs();
    console.log(`Restored ${restoredCount} scheduled jobs`);
});
