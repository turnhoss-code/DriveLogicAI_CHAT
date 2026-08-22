import fetch from 'node-fetch';
fetch('http://localhost:3000/api/keytest').then(res => res.text()).then(console.log).catch(console.error);
