import handler from './api/macro-data.ts';

const req = {
    url: 'http://localhost/api/macro-data',
    headers: {
        host: 'localhost'
    }
};

const res = {
    setHeader: () => {},
    status: (code) => {
        return {
            json: (data) => {
                console.log('Status:', code);
                console.log('Response:', data);
            }
        };
    }
};

handler(req, res).catch(console.error);
