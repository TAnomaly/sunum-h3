import 'reflect-metadata';
import dataSource from './typeorm.config';

async function run() {
    await dataSource.initialize();
    try {
        await dataSource.runMigrations();
        // eslint-disable-next-line no-console
        console.log('Migrations executed successfully');
    } finally {
        await dataSource.destroy();
    }
}

run().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Migration run failed', err);
    process.exit(1);
});


