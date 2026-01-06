try {
    console.log('Attempting to require next...');
    const next = require('next');
    console.log('Next loaded successfully');

    console.log('Attempting to require react...');
    const react = require('react');
    console.log('React loaded successfully');

    console.log('Current directory:', process.cwd());
} catch (e) {
    console.error('Error loading modules:', e);
}
